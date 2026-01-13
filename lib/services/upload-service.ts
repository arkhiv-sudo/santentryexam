import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, collection } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import imageCompression from "browser-image-compression";

const COLLECTION_INDEX = "image_index";

const COMPRESSION_OPTIONS = {
    maxSizeMB: 0.2, // 200KB
    maxWidthOrHeight: 1200,
    useWebWorker: true
};

const uploadLock = new Map<string, Promise<string>>();

export const UploadService = {
    /**
     * Uploads a file to Firebase Storage with a unique filename.
     */
    uploadImage: async (file: File, folder: string = "questions"): Promise<string> => {
        try {
            const fileExtension = file.name.split('.').pop();
            const fileName = `${uuidv4()}.${fileExtension}`;
            const storageRef = ref(storage, `${folder}/${fileName}`);

            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            return downloadURL;
        } catch (error) {
            console.error("[UploadService] Error uploading image:", error);
            throw error;
        }
    },

    /**
     * Calculates SHA-256 hash of a file content.
     */
    calculateHash: async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Uploads an image with deduplication.
     * Checks local and global cache before uploading true bytes.
     */
    uploadImageDeduplicated: async (file: File, folder: string = "questions"): Promise<string> => {
        try {
            const hash = await UploadService.calculateHash(file);
            console.log(`[UploadService] Checking hash: ${hash} for file: ${file.name}`);

            // 1. Check local session lock (prevents concurrency issues within the same session)
            if (uploadLock.has(hash)) {
                console.log(`[UploadService] Local lock hit for hash: ${hash}`);
                return uploadLock.get(hash)!;
            }

            // 2. Create a promise for this upload and lock it
            const uploadProcess = (async () => {
                // Check global Firestore index
                const globalUrl = await UploadService.getGlobalUrlByHash(hash);
                if (globalUrl) {
                    console.log(`[UploadService] Global hit for hash: ${hash} -> ${globalUrl}`);
                    return globalUrl;
                }

                console.log(`[UploadService] Cache miss for hash: ${hash}. Preparing upload...`);

                // Prepare file (compress if it's an image)
                let fileToUpload: File | Blob = file;
                const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

                if (isImage && file.size > 0) {
                    try {
                        fileToUpload = await imageCompression(file, COMPRESSION_OPTIONS);
                        console.log(`[UploadService] Compression reduced size from ${file.size} to ${fileToUpload.size}`);
                    } catch (e) {
                        console.error("[UploadService] Compression failed:", e);
                        fileToUpload = file;
                    }
                }

                // Upload to Storage
                const url = await UploadService.uploadImage(fileToUpload as File, folder);
                console.log(`[UploadService] Uploaded new file: ${url}`);

                // Register in global index
                await UploadService.registerGlobalHash(hash, url);

                return url;
            })();

            uploadLock.set(hash, uploadProcess);

            try {
                return await uploadProcess;
            } catch (err) {
                // If it failed, remove from lock Map so we can try again later
                uploadLock.delete(hash);
                throw err;
            }
        } catch (error) {
            console.error("[UploadService] Deduplicated upload failed:", error);
            // Fallback to normal upload if anything fails
            return UploadService.uploadImage(file, folder);
        }
    },

    /**
     * Checks if an image with the given hash already exists globally.
     */
    getGlobalUrlByHash: async (hash: string): Promise<string | null> => {
        try {
            const docRef = doc(db, COLLECTION_INDEX, hash);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data().url;
            }
            return null;
        } catch (error) {
            console.error("[UploadService] Error checking global hash:", error);
            return null;
        }
    },

    /**
     * Registers a new image URL with its hash in the global index.
     */
    registerGlobalHash: async (hash: string, url: string): Promise<void> => {
        try {
            await setDoc(doc(db, COLLECTION_INDEX, hash), {
                url,
                createdAt: new Date()
            }, { merge: true });
        } catch (error) {
            console.error("[UploadService] Error registering global hash:", error);
        }
    }
};
