'use client';

import { useCallback, useRef, useState } from 'react';
import { api } from './api';

/**
 * Voice dictation hook (F1.3). Dictation ONLY — the product never speaks.
 * Prefers the free browser-native Web Speech API where available; otherwise
 * records with MediaRecorder and transcribes via the backend (Groq Whisper).
 * Insert-at-cursor is the caller's job — this hook only surfaces text.
 */
export type DictationState = 'idle' | 'listening' | 'processing' | 'unsupported' | 'denied';

interface UseDictation {
  state: DictationState;
  interim: string;
  error: string | null;
  /** Which path is active — useful for tests and for hiding the mic when neither works. */
  path: 'webspeech' | 'backend' | null;
  start: () => Promise<void>;
  stop: () => void;
}

// The Web Speech API isn't in the TS DOM lib in all setups — narrow, local types.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(onText: (text: string) => void): UseDictation {
  const [state, setState] = useState<DictationState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<'webspeech' | 'backend' | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }, []);

  const startBackend = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recorderRef.current = recorder;
      chunksRef.current = [];
      setPath('backend');
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setState('processing');
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const { text } = await api.transcribe(blob);
          if (text) onText(text);
          setState('idle');
        } catch (e) {
          setError((e as { message?: string }).message ?? 'Transcription failed.');
          setState('idle');
        }
      };
      recorder.start();
      setState('listening');
      // Hard stop after 60s (backend cap is 60s / 5MB).
      setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop();
      }, 60_000);
    } catch {
      setState('denied');
      setError('Microphone access was blocked. Check your browser permissions.');
    }
  }, [onText]);

  const start = useCallback(async () => {
    setError(null);
    setInterim('');
    const SR = getSpeechRecognition();
    if (SR) {
      // Free browser-native path.
      setPath('webspeech');
      const recognition = new SR();
      recognitionRef.current = recognition;
      recognition.lang = navigator.language || 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      let finalText = '';
      recognition.onresult = (e) => {
        let liveInterim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else liveInterim += r[0].transcript;
        }
        setInterim(liveInterim);
      };
      recognition.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setState('denied');
          setError('Microphone access was blocked. Check your browser permissions.');
        } else {
          setError('Dictation error — try again.');
        }
      };
      recognition.onend = () => {
        setInterim('');
        if (finalText.trim()) onText(finalText.trim());
        setState('idle');
      };
      try {
        recognition.start();
        setState('listening');
      } catch {
        setState('idle');
      }
      return;
    }
    // Fallback: record + backend transcription.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof MediaRecorder !== 'undefined') {
      await startBackend();
    } else {
      setState('unsupported');
    }
  }, [onText, startBackend]);

  return { state, interim, error, path, start, stop };
}
