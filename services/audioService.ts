
declare const lamejs: any;

const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

const decodeAudioFile = (file: File): Promise<AudioBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      audioContext.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(`'${file.name}' 파일 디코딩 오류: ${err}`)
      );
    };
    reader.onerror = () => reject(`'${file.name}' 파일 읽기 오류`);
    reader.readAsArrayBuffer(file);
  });
};

const audioBufferToMp3 = (buffer: AudioBuffer): Blob => {
    const channels = buffer.numberOfChannels;
    const mp3encoder = new lamejs.Mp3Encoder(channels, buffer.sampleRate, 128);
    const mp3Data = [];

    const convertToInt16 = (float32array: Float32Array) => {
        const int16array = new Int16Array(float32array.length);
        for (let i = 0; i < float32array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32array[i]));
            int16array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16array;
    };
    
    const pcmLeft = convertToInt16(buffer.getChannelData(0));
    const pcmRight = channels > 1 ? convertToInt16(buffer.getChannelData(1)) : pcmLeft;
    
    const frameSize = 1152;
    for (let i = 0; i < pcmLeft.length; i += frameSize) {
        const leftChunk = pcmLeft.subarray(i, i + frameSize);
        let mp3buf: Int8Array;

        if (channels > 1) {
            const rightChunk = pcmRight.subarray(i, i + frameSize);
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        } else {
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        }

        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
};


export const mergeAudioFiles = async (file1: File, file2: File): Promise<Blob> => {
  try {
    const [buffer1, buffer2] = await Promise.all([
      decodeAudioFile(file1),
      decodeAudioFile(file2),
    ]);

    if (buffer1.sampleRate !== buffer2.sampleRate) {
        throw new Error(`샘플 레이트가 다릅니다: ${buffer1.sampleRate}Hz vs ${buffer2.sampleRate}Hz. 병합할 수 없습니다.`);
    }

    const numberOfChannels = Math.min(buffer1.numberOfChannels, buffer2.numberOfChannels);
    const totalLength = buffer1.length + buffer2.length;

    const mergedBuffer = audioContext.createBuffer(
      numberOfChannels,
      totalLength,
      buffer1.sampleRate
    );

    for (let i = 0; i < numberOfChannels; i++) {
      const channelData = mergedBuffer.getChannelData(i);
      channelData.set(buffer1.getChannelData(i), 0);
      channelData.set(buffer2.getChannelData(i), buffer1.length);
    }

    return audioBufferToMp3(mergedBuffer);
  } catch (error) {
    console.error("오디오 병합 중 오류 발생:", error);
    throw error;
  }
};