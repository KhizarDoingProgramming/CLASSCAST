import { useCallback, useRef, useState } from 'react';

export interface MediaState {
  screenStream: MediaStream | null;
  micStream: MediaStream | null;
  cameraStream: MediaStream | null;
  isScreenSharing: boolean;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  screenError: string | null;
  micError: string | null;
  cameraError: string | null;
}

export function useMedia() {
  const [state, setState] = useState<MediaState>({
    screenStream: null,
    micStream: null,
    cameraStream: null,
    isScreenSharing: false,
    isMicEnabled: false,
    isCameraEnabled: false,
    screenError: null,
    micError: null,
    cameraError: null,
  });

  const streamsRef = useRef<{ screen: MediaStream | null; mic: MediaStream | null; camera: MediaStream | null }>({
    screen: null,
    mic: null,
    camera: null,
  });

  const startScreenShare = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (streamsRef.current.screen) {
        stopScreenShare();
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      streamsRef.current.screen = stream;

      stream.getVideoTracks()[0].onended = () => {
        streamsRef.current.screen = null;
        setState(prev => ({ ...prev, screenStream: null, isScreenSharing: false }));
      };

      setState(prev => ({
        ...prev,
        screenStream: stream,
        isScreenSharing: true,
        screenError: null,
      }));

      return stream;
    } catch (err: any) {
      let message: string;
      if (err.name === 'NotAllowedError') {
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          message = 'Screen sharing requires HTTPS or localhost. Open this page at http://localhost:3000 instead.';
        } else {
          message = 'Screen sharing permission denied. Please allow screen sharing when prompted.';
        }
      } else if (err.name === 'NotFoundError') {
        message = 'No screen available to share.';
      } else {
        message = `Failed to share screen: ${err.message || err.name}`;
      }

      setState(prev => ({ ...prev, screenError: message }));
      return null;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (streamsRef.current.screen) {
      for (const track of streamsRef.current.screen.getTracks()) {
        track.stop();
      }
      streamsRef.current.screen = null;
    }
    setState(prev => ({ ...prev, screenStream: null, isScreenSharing: false, screenError: null }));
  }, []);

  const startMic = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (streamsRef.current.mic) {
        stopMic();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      streamsRef.current.mic = stream;

      stream.getAudioTracks()[0].onended = () => {
        streamsRef.current.mic = null;
        setState(prev => ({ ...prev, micStream: null, isMicEnabled: false }));
      };

      setState(prev => ({
        ...prev,
        micStream: stream,
        isMicEnabled: true,
        micError: null,
      }));

      return stream;
    } catch (err: any) {
      const message = err.name === 'NotAllowedError'
        ? 'Microphone permission denied.'
        : 'Failed to access microphone.';
      setState(prev => ({ ...prev, micError: message }));
      return null;
    }
  }, []);

  const stopMic = useCallback(() => {
    if (streamsRef.current.mic) {
      for (const track of streamsRef.current.mic.getTracks()) {
        track.stop();
      }
      streamsRef.current.mic = null;
    }
    setState(prev => ({ ...prev, micStream: null, isMicEnabled: false, micError: null }));
  }, []);

  const toggleMic = useCallback(async (): Promise<boolean> => {
    if (streamsRef.current.mic) {
      stopMic();
      return false;
    } else {
      const stream = await startMic();
      return stream !== null;
    }
  }, [startMic, stopMic]);

  const startCamera = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (streamsRef.current.camera) {
        stopCamera();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
        },
        audio: false,
      });

      streamsRef.current.camera = stream;

      stream.getVideoTracks()[0].onended = () => {
        streamsRef.current.camera = null;
        setState(prev => ({ ...prev, cameraStream: null, isCameraEnabled: false }));
      };

      setState(prev => ({
        ...prev,
        cameraStream: stream,
        isCameraEnabled: true,
        cameraError: null,
      }));

      return stream;
    } catch (err: any) {
      const message = err.name === 'NotAllowedError'
        ? 'Camera permission denied.'
        : 'Failed to access camera.';
      setState(prev => ({ ...prev, cameraError: message }));
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamsRef.current.camera) {
      for (const track of streamsRef.current.camera.getTracks()) {
        track.stop();
      }
      streamsRef.current.camera = null;
    }
    setState(prev => ({ ...prev, cameraStream: null, isCameraEnabled: false, cameraError: null }));
  }, []);

  const toggleCamera = useCallback(async (): Promise<boolean> => {
    if (streamsRef.current.camera) {
      stopCamera();
      return false;
    } else {
      const stream = await startCamera();
      return stream !== null;
    }
  }, [startCamera, stopCamera]);

  const stopAll = useCallback(() => {
    stopScreenShare();
    stopMic();
    stopCamera();
  }, [stopScreenShare, stopMic, stopCamera]);

  return {
    ...state,
    startScreenShare,
    stopScreenShare,
    startMic,
    stopMic,
    toggleMic,
    startCamera,
    stopCamera,
    toggleCamera,
    stopAll,
  };
}
