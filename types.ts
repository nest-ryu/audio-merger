
export interface FilePair {
  id: string;
  file1: File;
  file2: File;
}

export interface MergedFile {
  name: string;
  blob: Blob;
}

export type ProcessingStatus = 'idle' | 'processing' | 'done' | 'error';
