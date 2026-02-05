import { useCallback, useState } from 'react';
import type { Attachment } from './types';

const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;
const CHUNK_SIZE = 1024 * 1024;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface UseAttachmentsOptions {
  maxFileSize?: number;
  allowedFileTypes?: string[];
  onError?: (error: string) => void;
}

export function useAttachments(options: UseAttachmentsOptions = {}) {
  const { maxFileSize = 50 * 1024 * 1024, allowedFileTypes, onError } = options;
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const validateFile = useCallback(
    (file: File): boolean => {
      if (file.size > maxFileSize) {
        onError?.(`File "${file.name}" exceeds maximum size`);
        return false;
      }
      if (allowedFileTypes && allowedFileTypes.length > 0) {
        const isAllowed = allowedFileTypes.some((type) => {
          if (type.includes('*')) return file.type.startsWith(type.replace('/*', ''));
          return file.type === type;
        });
        if (!isAllowed) {
          onError?.(`File type not allowed`);
          return false;
        }
      }
      return true;
    },
    [maxFileSize, allowedFileTypes, onError]
  );

  const simulateUpload = useCallback((id: string, fileSize: number) => {
    const isLargeFile = fileSize > LARGE_FILE_THRESHOLD;
    if (!isLargeFile) {
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'uploaded' as const, uploadProgress: 100 } : a))
      );
      return;
    }
    let progress = 0;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const interval = setInterval(() => {
      progress += 100 / totalChunks;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'uploaded' as const, uploadProgress: 100 } : a))
        );
      } else {
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploadProgress: Math.round(progress) } : a))
        );
      }
    }, 200);
  }, []);

  const createAttachment = useCallback((file: File): Attachment => {
    const isImage = file.type.startsWith('image/');
    const attachment: Attachment = {
      id: generateId(),
      file,
      type: isImage ? 'image' : 'file',
      name: file.name,
      size: file.size,
      status: 'uploading',
      uploadProgress: 0,
    };
    if (isImage) attachment.previewUrl = URL.createObjectURL(file);
    return attachment;
  }, []);

  const addAttachment = useCallback(
    (file: File): Attachment | null => {
      if (!validateFile(file)) return null;
      const attachment = createAttachment(file);
      setAttachments((prev) => [...prev, attachment]);
      simulateUpload(attachment.id, file.size);
      return attachment;
    },
    [validateFile, createAttachment, simulateUpload]
  );

  const addAttachments = useCallback(
    (files: FileList | null): Attachment[] => {
      if (!files) return [];
      const newAttachments: Attachment[] = [];
      Array.from(files).forEach((file) => {
        const attachment = addAttachment(file);
        if (attachment) newAttachments.push(attachment);
      });
      return newAttachments;
    },
    [addAttachment]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
      return [];
    });
  }, []);

  const retryAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment) {
        simulateUpload(id, attachment.size);
        return prev.map((a) => (a.id === id ? { ...a, status: 'uploading' as const, errorMessage: undefined } : a));
      }
      return prev;
    });
  }, [simulateUpload]);

  return {
    attachments,
    addAttachment,
    addAttachments,
    removeAttachment,
    clearAttachments,
    retryAttachment,
    LARGE_FILE_THRESHOLD,
  };
}
