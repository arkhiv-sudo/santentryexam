"use client";

import { useState, useMemo } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, updateDoc, arrayUnion } from "firebase/firestore";
import Link from "next/link";
import { UserRole, UserProfile } from "@/types";
import { MONGOLIA_LOCATIONS } from "@/lib/data/locations";
import { toast } from "sonner";
import { Select } from "@/components/ui/Select";
import { ChevronDown, GraduationCap, Users } from "lucide-react";
import { generateStudentCode } from "@/lib/utils";

export default function SignupPage() {
    const [email, setEmail] = useState("");
    const [parentEmail, setParentEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [role, setRole] = useState<UserRole>("student");
    const [aimag, setAimag] = useState("");
    const [soum, setSoum] = useState("");
    const [school, setSchool] = useState("");
    const [className, setClassName] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const availableSoums = useMemo(() => {
        const found = MONGOLIA_LOCATIONS.find(l => l.aimag === aimag);
        return found ? found.soums : [];
    }, [aimag]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        if (!aimag || !soum) {
            const msg = "Аймаг болон сумаа сонгоно уу.";
            setError(msg);
            toast.error(msg);
            setLoading(false);
            return;
        }

        try {
            let finalEmail = email;
            let studentCode = "";

            if (role === "student") {
                // Generate a unique 6-digit code
                let exists = true;
                while (exists) {
                    studentCode = generateStudentCode();
                    const q = query(collection(db, "users"), where("studentCode", "==", studentCode));
                    const snapshot = await getDocs(q);
                    if (snapshot.empty) exists = false;
                }
                finalEmail = `${studentCode}@student.internal`;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
            const user = userCredential.user;

            const profile: UserProfile = {
                uid: user.uid,
                email: finalEmail,
                firstName: firstName,
                lastName: lastName,
                role: role,
                aimag: aimag,
                soum: soum,
                // @ts-ignore
                createdAt: serverTimestamp(),
            };

            if (role === "student") {
                profile.studentCode = studentCode;
                profile.parentEmail = parentEmail;
                profile.school = school;
                profile.class = className;

                // Auto-link to parent if exists
                const parentQuery = query(collection(db, "users"), where("email", "==", parentEmail), where("role", "==", "parent"));
                const parentSnapshot = await getDocs(parentQuery);
                if (!parentSnapshot.empty) {
                    const parentDoc = parentSnapshot.docs[0];
                    await updateDoc(doc(db, "users", parentDoc.id), {
                        children: arrayUnion(user.uid)
                    });
                    profile.children = []; // Students don't have children but good to have empty array if needed
                }
            } else if (role === "parent") {
                // Auto-link to any students already using this email
                const studentQuery = query(collection(db, "users"), where("parentEmail", "==", email), where("role", "==", "student"));
                const studentSnapshot = await getDocs(studentQuery);
                const childrenIds = studentSnapshot.docs.map(d => d.id);
                profile.children = childrenIds;
            }

            await setDoc(doc(db, "users", user.uid), profile);

            if (role === "student") {
                toast.success(`Бүртгэл амжилттай! Таны нэвтрэх код: ${studentCode}. Үүнийг нэвтрэхдээ имэйл хэсэгт бичнэ үү.`, {
                    duration: 10000,
                });
            } else {
                toast.success("Бүртгэл амжилттай үүслээ!");
            }

            router.push("/");
        } catch (err: any) {
            const msg = err.message || "Бүртгэл үүсгэхэд алдаа гарлаа.";
            setError(msg);
            toast.error(msg);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full shadow-2xl border-slate-200 bg-white overflow-hidden">
            <CardHeader className="space-y-2 text-center bg-slate-50/50 border-b border-slate-100 py-6">
                <CardTitle className="text-4xl font-extrabold tracking-tight text-slate-900">Бүртгүүлэх</CardTitle>
                <CardDescription className="text-slate-500 text-lg">
                    Шалгалтын порталд хандахын тулд бүртгэл үүсгэнэ үү
                </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
                <form onSubmit={handleSignup} className="space-y-8">
                    {/* Role Selection */}
                    <div className="grid grid-cols-2 gap-6">
                        <button
                            type="button"
                            onClick={() => setRole("student")}
                            className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-300 shadow-sm ${role === "student"
                                ? "border-blue-600 bg-blue-50 text-blue-700 ring-4 ring-blue-50 shadow-md"
                                : "border-slate-100 bg-slate-50/50 text-slate-500 hover:border-blue-100 hover:bg-white"
                                }`}
                        >
                            <GraduationCap className={`w-10 h-10 mb-3 ${role === 'student' ? 'text-blue-600' : 'text-slate-400'}`} />
                            <span className="text-base font-bold">Сурагч</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setRole("parent")}
                            className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-300 shadow-sm ${role === "parent"
                                ? "border-blue-600 bg-blue-50 text-blue-700 ring-4 ring-blue-50 shadow-md"
                                : "border-slate-100 bg-slate-50/50 text-slate-500 hover:border-blue-100 hover:bg-white"
                                }`}
                        >
                            <Users className={`w-10 h-10 mb-3 ${role === 'parent' ? 'text-blue-600' : 'text-slate-400'}`} />
                            <span className="text-base font-bold">Эцэг эх</span>
                        </button>
                    </div>

                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Овог</label>
                                <Input
                                    type="text"
                                    placeholder="Овгоо оруулна уу"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    required
                                    className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Нэр</label>
                                <Input
                                    type="text"
                                    placeholder="Өөрийн нэрээ оруулна уу"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    required
                                    className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">
                                {role === "student" ? "Эцэг эхийн имэйл хаяг" : "Имэйл хаяг"}
                            </label>
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                value={role === "student" ? parentEmail : email}
                                onChange={(e) => role === "student" ? setParentEmail(e.target.value) : setEmail(e.target.value)}
                                required
                                className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">Нууц үг</label>
                            <Input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl"
                            />
                        </div>

                        {/* Location Selectors */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Аймаг / Хот</label>
                                <div className="relative group">
                                    <Select
                                        value={aimag}
                                        onChange={(e) => {
                                            setAimag(e.target.value);
                                            setSoum("");
                                        }}
                                        required
                                        className="h-12"
                                    >
                                        <option value="">Аймаг сонгох</option>
                                        {MONGOLIA_LOCATIONS.map((l) => (
                                            <option key={l.aimag} value={l.aimag}>{l.aimag}</option>
                                        ))}
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Сум / Дүүрэг</label>
                                <div className="relative group">
                                    <Select
                                        value={soum}
                                        onChange={(e) => setSoum(e.target.value)}
                                        disabled={!aimag}
                                        required
                                        className={`h-12 ${!aimag && 'opacity-60 cursor-not-allowed'}`}
                                    >
                                        <option value="">Сум сонгох</option>
                                        {availableSoums.map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* Student Specific Fields */}
                        {role === "student" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-in slide-in-from-top-2 fade-in">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 ml-1">Сургууль</label>
                                    <Input
                                        type="text"
                                        placeholder="Сургуулийн нэр"
                                        value={school}
                                        onChange={(e) => setSchool(e.target.value)}
                                        required
                                        className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 ml-1">Анги</label>
                                    <Input
                                        type="text"
                                        placeholder="Жишээ: 12А"
                                        value={className}
                                        onChange={(e) => setClassName(e.target.value)}
                                        required
                                        className="h-12 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all rounded-xl"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <Button type="submit" className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xl transition-all shadow-xl hover:shadow-2xl active:scale-[0.98] rounded-2xl" disabled={loading}>
                        {loading ? "Бүртгэл үүсгэж байна..." : "Бүртгэл үүсгэх"}
                    </Button>

                    <div className="text-center text-base text-slate-500 font-medium">
                        Бүртгэлтэй юу?{" "}
                        <Link href="/login" className="font-bold text-blue-600 hover:text-blue-700 underline underline-offset-4 decoration-2 decoration-blue-100 transition-all hover:decoration-blue-600">
                            Нэвтрэх
                        </Link>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
