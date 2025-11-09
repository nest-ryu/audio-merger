
import React, { useState, useMemo } from 'react';
import { FilePair, MergedFile, ProcessingStatus } from './types';
import { mergeAudioFiles } from './services/audioService';

const ZipIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12V8a2 2 0 00-2-2H6a2 2 0 00-2 2v4m16 0z" />
    </svg>
);

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

const Spinner = () => (
  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

const extractNumber = (name: string): string | null => {
  const match = name.match(/\d+/);
  return match ? match[0] : null;
};

export default function App() {
    const [folder1Files, setFolder1Files] = useState<File[]>([]);
    const [folder2Files, setFolder2Files] = useState<File[]>([]);
    const [mergedFiles, setMergedFiles] = useState<MergedFile[]>([]);
    const [status, setStatus] = useState<ProcessingStatus>('idle');
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [zipFileName, setZipFileName] = useState<string>('');
    const [processingMessage, setProcessingMessage] = useState<string>('');

    const filePairs = useMemo<FilePair[]>(() => {
        const pairs: FilePair[] = [];
        const folder2Map = new Map<string, File>();

        folder2Files.forEach(file => {
            const num = extractNumber(file.name);
            if (num) {
                folder2Map.set(num, file);
            }
        });

        folder1Files.forEach(file1 => {
            const num = extractNumber(file1.name);
            if (num && folder2Map.has(num)) {
                const file2 = folder2Map.get(num)!;
                pairs.push({ id: num, file1, file2 });
            }
        });
        
        return pairs.sort((a,b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
    }, [folder1Files, folder2Files]);

    const handleZipFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setZipFileName(file.name);
        setStatus('processing');
        setProcessingMessage('ZIP 파일 처리 중...');
        setError(null);
        setFolder1Files([]);
        setFolder2Files([]);
        setMergedFiles([]);
        setProgress({ current: 0, total: 0 });

        try {
            const JSZip = (window as any).JSZip;
            if (!JSZip) {
                throw new Error("파일 압축 라이브러리를 로드할 수 없습니다.");
            }
            const zip = await JSZip.loadAsync(file);
            const directories: { [key: string]: any[] } = {};
            const audioExtensions = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'];

            zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir) {
                    const parts = relativePath.split('/');
                    const fileName = parts[parts.length - 1];
                    const isAudio = audioExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
                    
                    if (isAudio && parts.length > 1 && fileName) {
                        const dirName = parts[0];
                        if (!directories[dirName]) {
                            directories[dirName] = [];
                        }
                        directories[dirName].push(zipEntry);
                    }
                }
            });

            const dirNames = Object.keys(directories);
            if (dirNames.length !== 2) {
                throw new Error('압축 파일은 오디오 파일이 포함된 두 개의 폴더를 포함해야 합니다.');
            }

            const [dir1, dir2] = dirNames;

            const files1Promises = directories[dir1].map(async entry => {
                const blob = await entry.async('blob');
                return new File([blob], entry.name.split('/').pop()!, { type: blob.type });
            });
            const files2Promises = directories[dir2].map(async entry => {
                const blob = await entry.async('blob');
                return new File([blob], entry.name.split('/').pop()!, { type: blob.type });
            });
            
            setFolder1Files(await Promise.all(files1Promises));
            setFolder2Files(await Promise.all(files2Promises));
            setStatus('idle');
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            setError(`ZIP 파일 처리 오류: ${errorMessage}`);
            setStatus('error');
            setZipFileName('');
        } finally {
            setProcessingMessage('');
        }
    };

    const handleMerge = async () => {
        setStatus('processing');
        setError(null);
        setMergedFiles([]);
        setProgress({ current: 0, total: filePairs.length });

        const newMergedFiles: MergedFile[] = [];

        for (let i = 0; i < filePairs.length; i++) {
            const pair = filePairs[i];
            try {
                setProcessingMessage(`'${pair.file1.name.split('.')[0]}' 병합 중...`);
                const mergedBlob = await mergeAudioFiles(pair.file1, pair.file2);
                const newFileName = `merged_${pair.id}.mp3`;
                newMergedFiles.push({ name: newFileName, blob: mergedBlob });
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                setError(`'${pair.file1.name}'와 '${pair.file2.name}' 병합 중 오류 발생: ${errorMessage}`);
                setStatus('error');
                setProcessingMessage('');
                return;
            }
            setProgress({ current: i + 1, total: filePairs.length });
        }
        
        setMergedFiles(newMergedFiles);
        setStatus('done');
        setProcessingMessage('');
    };
    
    const handleDownloadAll = async () => {
        if (mergedFiles.length === 0) return;
        const JSZip = (window as any).JSZip;
        if (!JSZip) {
            setError("파일 압축 라이브러리를 로드할 수 없습니다.");
            return;
        }
        const zip = new JSZip();
        mergedFiles.forEach(file => {
            zip.file(file.name, file.blob);
        });
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'merged_audio_files_mp3.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center p-4 md:p-8">
            <main className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">오디오 파일 일괄 병합</h1>
                    <p className="text-gray-400">ZIP 파일 속 두 폴더의 오디오 파일을 숫자로 매칭하여 MP3로 합칩니다.</p>
                </header>

                <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                     <div className="flex flex-col gap-2 mb-4">
                        <label htmlFor="zip-upload" className="w-full cursor-pointer bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg inline-flex items-center justify-center transition duration-300 ease-in-out">
                            <ZipIcon />
                            <span>ZIP 파일 선택</span>
                        </label>
                        <input
                            id="zip-upload"
                            type="file"
                            accept=".zip,application/zip"
                            onChange={handleZipFileChange}
                            className="hidden"
                            disabled={status === 'processing'}
                        />
                        <p className="text-center text-sm text-gray-400 h-5">
                            {zipFileName && status !== 'error' ? `${zipFileName} 선택됨` : "ZIP 파일을 선택하세요"}
                        </p>
                    </div>
                    
                    <button 
                        onClick={handleMerge}
                        disabled={filePairs.length === 0 || status === 'processing'}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-300 ease-in-out flex items-center justify-center"
                    >
                       {status === 'processing' ? <Spinner /> : null}
                       <span className="ml-2">
                        {status === 'processing' 
                            ? processingMessage || `병합 중... (${progress.current}/${progress.total})`
                            : `${filePairs.length}개 파일 쌍 병합 시작`}
                        </span>
                    </button>
                    {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h2 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2">병합 대기 목록 ({filePairs.length})</h2>
                        <div className="max-h-96 overflow-y-auto">
                            {filePairs.length > 0 ? (
                                <ul className="divide-y divide-gray-700">
                                    {filePairs.map(pair => (
                                        <li key={pair.id} className="p-3 text-sm flex items-center justify-between">
                                            <div className="flex-1 truncate" title={pair.file1.name}>{pair.file1.name}</div>
                                            <span className="text-indigo-400 mx-2">+</span>
                                            <div className="flex-1 truncate text-right" title={pair.file2.name}>{pair.file2.name}</div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-gray-500 text-center py-8">ZIP 파일을 선택하면 병합할 파일 목록이 여기에 표시됩니다.</p>
                            )}
                        </div>
                    </div>

                     <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                            <h2 className="text-xl font-semibold">병합 완료 (MP3)</h2>
                             <button
                                onClick={handleDownloadAll}
                                disabled={mergedFiles.length === 0 || status === 'processing'}
                                className="bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:text-gray-500 text-white font-bold py-2 px-4 rounded-lg text-sm transition duration-300"
                            >
                                모두 다운로드 (ZIP)
                            </button>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {status === 'done' && mergedFiles.length > 0 ? (
                                <ul className="divide-y divide-gray-700">
                                    {mergedFiles.map(file => (
                                        <li key={file.name} className="p-3 flex items-center justify-between">
                                            <span className="truncate">{file.name}</span>
                                            <a
                                                href={URL.createObjectURL(file.blob)}
                                                download={file.name}
                                                className="inline-flex items-center bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded-lg text-sm transition duration-300"
                                            >
                                                <DownloadIcon/>
                                                다운로드
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-gray-500 text-center py-8">
                                    {status === 'idle' && '병합이 완료되면 결과가 여기에 표시됩니다.'}
                                    {status === 'processing' && '파일을 처리하고 있습니다...'}
                                    {status === 'done' && '병합된 파일이 없습니다.'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}