import {
  Session,
  SessionConfig,
  Participant,
  ParticipantId,
  SessionId,
  AttendanceRecord,
  ChatMessage,
  generateId,
  generatePin,
  validateName,
  validateRollNumber,
  validatePin,
  validateRoomName,
  sanitizeInput,
  DEFAULT_MAX_PARTICIPANTS,
} from '@classcast/shared';
import { logger } from './logger';

const HOST_GRACE_PERIOD_MS = 60_000;

export class SessionManager {
  private sessions: Map<SessionId, Session> = new Map();
  private hostDisconnectTimers: Map<SessionId, ReturnType<typeof setTimeout>> = new Map();

  createSession(config: {
    roomName: string;
    pin?: string;
    maxParticipants?: number;
    port: number;
  }): Session {
    const sessionId = generateId();
    const pin = config.pin && validatePin(config.pin) ? config.pin : generatePin();

    const session: Session = {
      id: sessionId,
      config: {
        roomName: sanitizeInput(config.roomName),
        pin,
        maxParticipants: config.maxParticipants || DEFAULT_MAX_PARTICIPANTS,
        requireJoinApproval: true,
        allowParticipantScreenShare: true,
        requireScreenShareApproval: true,
        allowMicrophone: true,
        allowCamera: true,
        allowChat: true,
        port: config.port,
      },
      hostId: '',
      participants: new Map(),
      pendingRequests: [],
      createdAt: Date.now(),
      isActive: true,
      activePresenterId: null,
    };

    this.sessions.set(sessionId, session);
    logger.info(`Session created: ${config.roomName} (${sessionId})`);
    return session;
  }

  getSession(sessionId: SessionId): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSession(): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.isActive) return session;
    }
    return undefined;
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }

  setHost(sessionId: SessionId, participantId: ParticipantId): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.hostId = participantId;
  }

  addParticipant(sessionId: SessionId, rollNumber: string, name: string, existingId?: ParticipantId): { success: boolean; participant?: Participant; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found.' };
    }
    if (!session.isActive) {
      return { success: false, error: 'This session has ended.' };
    }

    const cleanRoll = sanitizeInput(rollNumber);
    const cleanName = sanitizeInput(name);

    if (!validateRollNumber(cleanRoll)) {
      return { success: false, error: 'Invalid roll number. Must be 2-30 characters.' };
    }
    if (!validateName(cleanName)) {
      return { success: false, error: 'Invalid name. Must be 2-60 characters.' };
    }

    // Check duplicate roll number
    for (const p of session.participants.values()) {
      if (p.rollNumber === cleanRoll && p.isConnected) {
        return { success: false, error: 'That roll number is already connected.' };
      }
    }

    // Check participant limit
    const connectedCount = Array.from(session.participants.values()).filter(p => p.isConnected).length;
    if (connectedCount >= session.config.maxParticipants) {
      return { success: false, error: 'Classroom is full.' };
    }

    const participantId = existingId || generateId();
    const participant: Participant = {
      id: participantId,
      rollNumber: cleanRoll,
      name: cleanName,
      joinedAt: Date.now(),
      leftAt: null,
      isConnected: true,
      isHost: false,
      hasHandRaised: false,
      isMicEnabled: false,
      isCameraEnabled: false,
      isScreenSharing: false,
      hasScreenSharePermission: session.config.allowParticipantScreenShare,
      hasMicPermission: session.config.allowMicrophone,
      hasCameraPermission: session.config.allowCamera,
      hasChatPermission: session.config.allowChat,
    };

    session.participants.set(participantId, participant);
    logger.info(`Participant added: ${cleanName} (${cleanRoll}) → ${session.config.roomName}`);
    return { success: true, participant };
  }

  addHostParticipant(sessionId: SessionId, name: string = 'Host'): Participant {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const participantId = generateId();
    const participant: Participant = {
      id: participantId,
      rollNumber: 'HOST',
      name: sanitizeInput(name),
      joinedAt: Date.now(),
      leftAt: null,
      isConnected: true,
      isHost: true,
      hasHandRaised: false,
      isMicEnabled: false,
      isCameraEnabled: false,
      isScreenSharing: false,
      hasScreenSharePermission: true,
      hasMicPermission: true,
      hasCameraPermission: true,
      hasChatPermission: true,
    };

    session.participants.set(participantId, participant);
    session.hostId = participantId;
    return participant;
  }

  removeParticipant(sessionId: SessionId, participantId: ParticipantId): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const participant = session.participants.get(participantId);
    if (!participant) return false;

    participant.isConnected = false;
    participant.leftAt = Date.now();
    logger.info(`Participant removed: ${participant.name} (${participant.rollNumber})`);
    return true;
  }

  getParticipant(sessionId: SessionId, participantId: ParticipantId): Participant | undefined {
    const session = this.sessions.get(sessionId);
    return session?.participants.get(participantId);
  }

  getConnectedParticipants(sessionId: SessionId): Participant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.participants.values()).filter(p => p.isConnected);
  }

  getAllParticipants(sessionId: SessionId): Participant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.participants.values());
  }

  addPendingRequest(sessionId: SessionId, participant: Participant): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.pendingRequests.push(participant);
  }

  removePendingRequest(sessionId: SessionId, participantId: ParticipantId): Participant | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const idx = session.pendingRequests.findIndex(p => p.id === participantId);
    if (idx === -1) return undefined;
    return session.pendingRequests.splice(idx, 1)[0];
  }

  getPendingRequests(sessionId: SessionId): Participant[] {
    const session = this.sessions.get(sessionId);
    return session?.pendingRequests || [];
  }

  endSession(sessionId: SessionId): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    this.cancelHostDisconnect(sessionId);
    session.isActive = false;
    for (const p of session.participants.values()) {
      if (p.isConnected) {
        p.isConnected = false;
        p.leftAt = Date.now();
      }
    }
    logger.info(`Session ended: ${session.config.roomName}`);
    return true;
  }

  startHostDisconnect(sessionId: SessionId, onGraceExpired: () => void): void {
    this.cancelHostDisconnect(sessionId);
    const timer = setTimeout(() => {
      this.hostDisconnectTimers.delete(sessionId);
      onGraceExpired();
    }, HOST_GRACE_PERIOD_MS);
    this.hostDisconnectTimers.set(sessionId, timer);
    const session = this.sessions.get(sessionId);
    logger.info(`Host disconnected from ${session?.config.roomName || sessionId}, grace period ${HOST_GRACE_PERIOD_MS / 1000}s`);
  }

  cancelHostDisconnect(sessionId: SessionId): void {
    const timer = this.hostDisconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.hostDisconnectTimers.delete(sessionId);
    }
  }

  updatePermission(sessionId: SessionId, setting: string, value: boolean, targetId?: ParticipantId): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    switch (setting) {
      case 'allowParticipantScreenShare':
        session.config.allowParticipantScreenShare = value;
        for (const p of session.participants.values()) {
          if (!p.isHost) p.hasScreenSharePermission = value;
        }
        break;
      case 'requireScreenShareApproval':
        session.config.requireScreenShareApproval = value;
        break;
      case 'allowMicrophone':
        session.config.allowMicrophone = value;
        for (const p of session.participants.values()) {
          if (!p.isHost) p.hasMicPermission = value;
        }
        break;
      case 'allowCamera':
        session.config.allowCamera = value;
        for (const p of session.participants.values()) {
          if (!p.isHost) p.hasCameraPermission = value;
        }
        break;
      case 'allowChat':
        session.config.allowChat = value;
        for (const p of session.participants.values()) {
          if (!p.isHost) p.hasChatPermission = value;
        }
        break;
      case 'requireJoinApproval':
        session.config.requireJoinApproval = value;
        break;
      default:
        return false;
    }
    return true;
  }

  getAttendance(sessionId: SessionId): AttendanceRecord[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.participants.values()).map(p => ({
      rollNumber: p.rollNumber,
      name: p.name,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      isConnected: p.isConnected,
    }));
  }

  cleanup(): void {
    for (const [id, session] of this.sessions) {
      if (!session.isActive) {
        this.sessions.delete(id);
      }
    }
  }
}
