import { ParticipantId } from '@classcast/shared';

export type PeerEventType = 'stream' | 'connection-state-change' | 'ice-candidate' | 'negotiationneeded';

export interface PeerEvent {
  type: PeerEventType;
  participantId: ParticipantId;
  stream?: MediaStream;
  state?: RTCPeerConnectionState;
  candidate?: RTCIceCandidateInit;
}

type PeerEventHandler = (event: PeerEvent) => void;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class WebRTCManager {
  private peers: Map<ParticipantId, RTCPeerConnection> = new Map();
  private localStreams: MediaStream[] = [];
  private handler: PeerEventHandler;
  private sendSignal: (to: ParticipantId, signal: import('@classcast/shared').WebRTCSignal) => void;

  constructor(
    sendSignal: (to: ParticipantId, signal: import('@classcast/shared').WebRTCSignal) => void,
    handler: PeerEventHandler
  ) {
    this.sendSignal = sendSignal;
    this.handler = handler;
  }

  private createPeerConnection(participantId: ParticipantId): RTCPeerConnection {
    const existing = this.peers.get(participantId);
    if (existing && existing.signalingState !== 'closed') {
      return existing;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(participantId, {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.handler({
          type: 'stream',
          participantId,
          stream: event.streams[0],
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.handler({
        type: 'connection-state-change',
        participantId,
        state: pc.connectionState,
      });

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeer(participantId);
      }
    };

    pc.onnegotiationneeded = () => {
      this.handler({
        type: 'negotiationneeded',
        participantId,
      });
    };

    this.peers.set(participantId, pc);
    return pc;
  }

  async createOffer(participantId: ParticipantId, stream: MediaStream): Promise<void> {
    const pc = this.createPeerConnection(participantId);

    const existingSenders = pc.getSenders();
    for (const track of stream.getTracks()) {
      const existing = existingSenders.find(s => s.track?.kind === track.kind);
      if (existing) {
        await existing.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendSignal(participantId, {
      type: 'offer',
      sdp: offer,
    });
  }

  async handleOffer(participantId: ParticipantId, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.createPeerConnection(participantId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.sendSignal(participantId, {
      type: 'answer',
      sdp: answer,
    });
  }

  async handleAnswer(participantId: ParticipantId, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peers.get(participantId);
    if (pc && pc.signalingState === 'have-local-offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  addIceCandidate(participantId: ParticipantId, candidate: RTCIceCandidateInit): void {
    const pc = this.peers.get(participantId);
    if (pc && pc.signalingState !== 'closed') {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  addLocalStream(stream: MediaStream): void {
    this.localStreams.push(stream);
    for (const [participantId, pc] of this.peers) {
      if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
        const existingSenders = pc.getSenders();
        for (const track of stream.getTracks()) {
          const existing = existingSenders.find(s => s.track?.kind === track.kind);
          if (existing) {
            existing.replaceTrack(track).catch(() => {});
          } else {
            try {
              pc.addTrack(track, stream);
            } catch {}
          }
        }
      }
    }
  }

  removeLocalStream(stream: MediaStream): void {
    const idx = this.localStreams.indexOf(stream);
    if (idx !== -1) this.localStreams.splice(idx, 1);

    for (const [, pc] of this.peers) {
      for (const sender of pc.getSenders()) {
        if (sender.track && stream.getTracks().includes(sender.track)) {
          sender.replaceTrack(null).catch(() => {});
        }
      }
    }

    for (const track of stream.getTracks()) {
      track.stop();
    }
  }

  replaceTrack(oldTrack: MediaStreamTrack | null, newTrack: MediaStreamTrack | null): void {
    for (const [, pc] of this.peers) {
      for (const sender of pc.getSenders()) {
        if (oldTrack && sender.track?.kind === oldTrack.kind) {
          sender.replaceTrack(newTrack).catch(() => {});
        }
      }
    }
  }

  getPeerConnection(participantId: ParticipantId): RTCPeerConnection | undefined {
    return this.peers.get(participantId);
  }

  getRemoteStream(participantId: ParticipantId): MediaStream | null {
    const pc = this.peers.get(participantId);
    if (!pc) return null;
    const receivers = pc.getReceivers();
    for (const r of receivers) {
      if (r.track) {
        const stream = new MediaStream([r.track]);
        return stream;
      }
    }
    return null;
  }

  closePeer(participantId: ParticipantId): void {
    const pc = this.peers.get(participantId);
    if (pc) {
      pc.close();
      this.peers.delete(participantId);
    }
  }

  closeAll(): void {
    for (const [participantId, pc] of this.peers) {
      pc.close();
    }
    this.peers.clear();

    for (const stream of this.localStreams) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    this.localStreams = [];
  }
}
