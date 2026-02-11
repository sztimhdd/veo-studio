/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef } from 'react';
import { PlusIcon, XMarkIcon } from './icons';
import { ImageFile } from '../types';

const fileToBase64 = <T extends { file: File; base64: string }>(
    file: File,
): Promise<T> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            if (base64) {
                resolve({ file, base64 } as T);
            } else {
                reject(new Error('Failed to read file as base64.'));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};
const fileToImageFile = (file: File): Promise<ImageFile> =>
    fileToBase64<ImageFile>(file);

interface ImageUploadProps {
    onSelect: (image: ImageFile) => void;
    onRemove?: () => void;
    image?: ImageFile | null;
    label: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
    onSelect,
    onRemove,
    image,
    label,
    className = "w-28 h-20",
    disabled = false
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const imageFile = await fileToImageFile(file);
                onSelect(imageFile);
            } catch (error) {
                console.error('Error converting file:', error);
            }
        }
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    if (image) {
        return (
            <div className={`relative group ${className}`}>
                <img
                    src={URL.createObjectURL(image.file)}
                    alt="preview"
                    className="w-full h-full object-cover rounded-lg shadow-inner border border-gray-600"
                />
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={disabled}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove image">
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className={`${className} bg-gray-700/50 hover:bg-gray-700 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}>
            <PlusIcon className="w-6 h-6" />
            <span className="text-xs mt-1 text-center px-1">{label}</span>
            <input
                type="file"
                ref={inputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
                disabled={disabled}
            />
        </button>
    );
};
