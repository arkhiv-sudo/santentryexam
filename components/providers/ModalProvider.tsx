'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'destructive' | 'default';
}

interface ModalContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        options: ConfirmOptions;
        resolve: (value: boolean) => void;
    } | null>(null);

    const confirm = useCallback((options: ConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            setConfirmState({
                isOpen: true,
                options,
                resolve,
            });
        });
    }, []);

    const handleClose = useCallback((value: boolean) => {
        if (confirmState) {
            confirmState.resolve(value);
            setConfirmState(prev => prev ? { ...prev, isOpen: false } : null);
        }
    }, [confirmState]);

    return (
        <ModalContext.Provider value={{ confirm }}>
            {children}
            {confirmState && (
                <Modal
                    isOpen={confirmState.isOpen}
                    onClose={() => handleClose(false)}
                    title={confirmState.options.title || 'Баталгаажуулах'}
                    footer={
                        <>
                            <Button
                                variant="outline"
                                onClick={() => handleClose(false)}
                            >
                                {confirmState.options.cancelLabel || 'Цуцлах'}
                            </Button>
                            <Button
                                variant={confirmState.options.variant || 'default'}
                                onClick={() => handleClose(true)}
                                className={confirmState.options.variant === 'destructive' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}
                            >
                                {confirmState.options.confirmLabel || 'Тийм'}
                            </Button>
                        </>
                    }
                >
                    <div className="flex flex-col items-center text-center py-2">
                        {confirmState.options.variant === 'destructive' && (
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
                                <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        )}
                        <p className="text-lg text-slate-600 dark:text-slate-300">
                            {confirmState.options.message}
                        </p>
                    </div>
                </Modal>
            )}
        </ModalContext.Provider>
    );
};

export const useConfirm = () => {
    const context = useContext(ModalContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ModalProvider');
    }
    return context.confirm;
};
