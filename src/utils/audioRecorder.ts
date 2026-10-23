/**
 * Meeting Audio Recorder and 16kHz resampler for Whisper AI
 */
export class MeetingAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      options.mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      options.mimeType = 'audio/webm';
    }

    this.mediaRecorder = new MediaRecorder(this.stream, options);
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.mediaRecorder.start(1000);
  }

  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.stream = null;
    }
  }

  hasAudio(): boolean {
    return this.chunks.length > 0;
  }

  getBlob(): Blob | null {
    if (this.chunks.length === 0) return null;
    return new Blob(this.chunks, { type: this.chunks[0].type || 'audio/webm' });
  }

  async get16kSamples(): Promise<Float32Array | null> {
    const blob = this.getBlob();
    if (!blob || blob.size < 500) return null;

    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    const audioCtx = new AudioCtx();
    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const targetSampleRate = 16000;
      const numChannels = 1;
      const targetLength = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));
      const offlineCtx = new OfflineAudioContext(numChannels, targetLength, targetSampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(offlineCtx.destination);
      source.start(0);
      const rendered = await offlineCtx.startRendering();
      return rendered.getChannelData(0);
    } catch (err) {
      console.warn('Audio decoding error:', err);
      return null;
    } finally {
      await audioCtx.close().catch(() => {});
    }
  }
}
