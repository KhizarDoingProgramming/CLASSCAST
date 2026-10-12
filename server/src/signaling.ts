import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';
import {
  ClientMessage,
  ServerMessage,
  ParticipantId,
  SessionId,
  ChatMessage,
  generateId,
  validateChatMessage,
  sanitizeInput,
} from '@classcast/shared';
import { SessionManager } from './session';
import { logger } from './logger';
import { getLocalIp } from './network';

interface ConnectedClient {
  ws: WebSocket;
  participantId: ParticipantId | null;
  sessionId: SessionId | null;
  isHost: boolean;
  lastPing: number;
}

export class SignalingServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private sessionManager: SessionManager;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  start(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      logger.debug(`WebSocket connection from ${req.socket.remoteAddress}`);
      const client: ConnectedClient = {
        ws,
        participantId: null,
        sessionId: null,
        isHost: false,
        lastPing: Date.now(),
      };
      this.clients.set(ws, client);

      ws.on('message', (data) => {
        try {
          const raw = data.toString();
          if (raw.length > 10000) {
            logger.warn('Message too large, ignoring');
            return;
          }
          const msg: ClientMessage = JSON.parse(raw);
          this.handleMessage(client, msg);
        } catch (err) {
          logger.error('Invalid message received', err);
          this.send(client, { type: 'ERROR', code: 'INVALID_MESSAGE', message: 'Invalid message format.' });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(client);
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        logger.error('WebSocket error', err);
        this.clients.delete(ws);
      });
    });

    this.pingInterval = setInterval(() => {
      const now = Date.now();
      for (const [ws, client] of this.clients) {
        if (now - client.lastPing > 30000) {
          logger.debug('Client timed out, closing');
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }, 10000);

    logger.info('Signaling server started');
  }

  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const [ws] of this.clients) {
      try {
        ws.close(1000, 'Server shutting down');
      } catch {}
    }
    this.clients.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    logger.info('Signaling server stopped');
  }

  private send(client: ConnectedClient, msg: ServerMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(msg));
      } catch (err) {
        logger.error('Failed to send message', err);
      }
    }
  }

  private broadcast(sessionId: SessionId, msg: ServerMessage, excludeId?: ParticipantId): void {
    for (const [, client] of this.clients) {
      if (client.sessionId === sessionId && client.participantId !== excludeId) {
        this.send(client, msg);
      }
    }
  }

  private sendToParticipant(sessionId: SessionId, participantId: ParticipantId, msg: ServerMessage): void {
    for (const [, client] of this.clients) {
      if (client.sessionId === sessionId && client.participantId === participantId) {
        this.send(client, msg);
      }
    }
  }

  private handleMessage(client: ConnectedClient, msg: ClientMessage): void {
    client.lastPing = Date.now();

    switch (msg.type) {
      case 'CREATE_SESSION':
        this.handleCreateSession(client, msg);
        break;
      case 'JOIN_REQUEST':
        this.handleJoinRequest(client, msg);
        break;
      case 'JOIN_WITH_PIN':
        this.handleJoinWithPin(client, msg);
        break;
      case 'ACCEPT_PARTICIPANT':
        this.handleAcceptParticipant(client, msg);
        break;
      case 'REJECT_PARTICIPANT':
        this.handleRejectParticipant(client, msg);
        break;
      case 'REMOVE_PARTICIPANT':
        this.handleRemoveParticipant(client, msg);
        break;
      case 'SCREEN_SHARE_REQUEST':
        this.handleScreenShareRequest(client);
        break;
      case 'SCREEN_SHARE_APPROVE':
        this.handleScreenShareApprove(client, msg);
        break;
      case 'SCREEN_SHARE_REJECT':
        this.handleScreenShareReject(client, msg);
        break;
      case 'SCREEN_SHARE_STOP':
        this.handleScreenShareStop(client, msg);
        break;
      case 'MIC_TOGGLE':
        this.handleMicToggle(client, msg);
        break;
      case 'CAMERA_TOGGLE':
        this.handleCameraToggle(client, msg);
        break;
      case 'CHAT_MESSAGE':
        this.handleChatMessage(client, msg);
        break;
      case 'RAISE_HAND':
        this.handleRaiseHand(client);
        break;
      case 'LOWER_HAND':
        this.handleLowerHand(client);
        break;
      case 'PERMISSION_CHANGE':
        this.handlePermissionChange(client, msg);
        break;
      case 'END_SESSION':
        this.handleEndSession(client);
        break;
      case 'RECONNECT_HOST':
        this.handleReconnectHost(client, msg);
        break;
      case 'PING':
        this.send(client, { type: 'PONG' });
        break;
      case 'WEBRTC_SIGNAL':
        this.handleWebRTCSignal(client, msg);
        break;
      default:
        this.send(client, { type: 'ERROR', code: 'UNKNOWN_TYPE', message: 'Unknown message type.' });
    }
  }

  private handleCreateSession(client: ConnectedClient, msg: ClientMessage & { type: 'CREATE_SESSION' }): void {
    if (!msg.roomName || msg.roomName.trim().length < 2) {
      this.send(client, { type: 'ERROR', code: 'INVALID_INPUT', message: 'Room name must be at least 2 characters.' });
      return;
    }

    const session = this.sessionManager.createSession({
      roomName: msg.roomName,
      pin: msg.pin,
      maxParticipants: msg.maxParticipants,
      port: msg.port || 3000,
    });

    const hostParticipant = this.sessionManager.addHostParticipant(session.id, 'Host');
    this.sessionManager.setHost(session.id, hostParticipant.id);

    client.participantId = hostParticipant.id;
    client.sessionId = session.id;
    client.isHost = true;

    const localIp = getLocalIp();

    this.send(client, {
      type: 'SESSION_CREATED',
      sessionId: session.id,
      hostId: hostParticipant.id,
      localUrl: `http://${localIp}:${session.config.port}`,
      localIp,
      port: session.config.port,
    });

    logger.info(`Host created session: ${session.config.roomName} at http://${localIp}:${session.config.port}`);
  }

  private handleJoinRequest(client: ConnectedClient, msg: ClientMessage & { type: 'JOIN_REQUEST' }): void {
    const session = this.sessionManager.getSession(msg.sessionId);
    if (!session || !session.isActive) {
      this.send(client, { type: 'JOIN_REJECTED', reason: 'Session not found or has ended.' });
      return;
    }

    const cleanRoll = sanitizeInput(msg.rollNumber);
    const cleanName = sanitizeInput(msg.name);

    if (session.config.requireJoinApproval) {
      const tempParticipant: import('@classcast/shared').Participant = {
        id: generateId(),
        rollNumber: cleanRoll,
        name: cleanName,
        joinedAt: Date.now(),
        leftAt: null,
        isConnected: false,
        isHost: false,
        hasHandRaised: false,
        isMicEnabled: false,
        isCameraEnabled: false,
        isScreenSharing: false,
        hasScreenSharePermission: false,
        hasMicPermission: false,
        hasCameraPermission: false,
        hasChatPermission: false,
      };

      (tempParticipant as any)._ws = client;
      this.sessionManager.addPendingRequest(msg.sessionId, tempParticipant);

      this.send(client, { type: 'JOIN_REQUEST_SENT', message: 'Waiting for host approval...' });

      this.sendToParticipant(msg.sessionId, session.hostId, {
        type: 'JOIN_REQUESTED',
        participantId: tempParticipant.id,
        participantName: cleanName,
        rollNumber: cleanRoll,
      });

      const pending = this.sessionManager.getPendingRequests(msg.sessionId);
      this.sendToParticipant(msg.sessionId, session.hostId, {
        type: 'PENDING_REQUESTS',
        requests: pending.map(p => ({ ...p })),
      });

      logger.info(`Join request from ${cleanName} (${cleanRoll})`);
    } else {
      const result = this.sessionManager.addParticipant(msg.sessionId, msg.rollNumber, msg.name);
      if (!result.success || !result.participant) {
        this.send(client, { type: 'JOIN_REJECTED', reason: result.error || 'Failed to join.' });
        return;
      }

      client.participantId = result.participant.id;
      client.sessionId = msg.sessionId;

      const participants = this.sessionManager.getConnectedParticipants(msg.sessionId);
      this.send(client, {
        type: 'JOIN_ACCEPTED',
        participantId: result.participant.id,
        sessionId: msg.sessionId,
        participants,
        config: session.config,
      });

      this.broadcast(msg.sessionId, {
        type: 'PARTICIPANT_JOINED',
        participant: result.participant,
      }, result.participant.id);
    }
  }

  private handleJoinWithPin(client: ConnectedClient, msg: ClientMessage & { type: 'JOIN_WITH_PIN' }): void {
    const session = this.sessionManager.getSession(msg.sessionId);
    if (!session || !session.isActive) {
      this.send(client, { type: 'JOIN_REJECTED', reason: 'Session not found or has ended.' });
      return;
    }

    if (msg.pin !== session.config.pin) {
      this.send(client, { type: 'JOIN_REJECTED', reason: 'Incorrect PIN.' });
      return;
    }

    const result = this.sessionManager.addParticipant(msg.sessionId, msg.rollNumber, msg.name);
    if (!result.success || !result.participant) {
      this.send(client, { type: 'JOIN_REJECTED', reason: result.error || 'Failed to join.' });
      return;
    }

    client.participantId = result.participant.id;
    client.sessionId = msg.sessionId;

    const participants = this.sessionManager.getConnectedParticipants(msg.sessionId);
    this.send(client, {
      type: 'JOIN_ACCEPTED',
      participantId: result.participant.id,
      sessionId: msg.sessionId,
      participants,
      config: session.config,
    });

    this.broadcast(msg.sessionId, {
      type: 'PARTICIPANT_JOINED',
      participant: result.participant,
    }, result.participant.id);

    logger.info(`Participant joined with PIN: ${result.participant.name} (${result.participant.rollNumber})`);
  }

  private handleAcceptParticipant(client: ConnectedClient, msg: ClientMessage & { type: 'ACCEPT_PARTICIPANT' }): void {
    if (!client.isHost || !client.sessionId) {
      this.send(client, { type: 'ERROR', code: 'UNAUTHORIZED', message: 'Only the host can accept participants.' });
      return;
    }

    const pending = this.sessionManager.removePendingRequest(client.sessionId, msg.participantId);
    if (!pending) {
      this.send(client, { type: 'ERROR', code: 'NOT_FOUND', message: 'Request not found.' });
      return;
    }

    const pendingClient = (pending as any)._ws as ConnectedClient | undefined;

    const result = this.sessionManager.addParticipant(client.sessionId, pending.rollNumber, pending.name, pending.id);
    if (!result.success || !result.participant) {
      this.send(client, { type: 'ERROR', code: 'JOIN_FAILED', message: result.error || 'Failed to add participant.' });
      return;
    }

    if (pendingClient) {
      pendingClient.participantId = result.participant.id;
      pendingClient.sessionId = client.sessionId;

      const participants = this.sessionManager.getConnectedParticipants(client.sessionId);
      this.send(pendingClient, {
        type: 'JOIN_ACCEPTED',
        participantId: result.participant.id,
        sessionId: client.sessionId,
        participants,
        config: this.sessionManager.getSession(client.sessionId)!.config,
      });
    }

    this.broadcast(client.sessionId, {
      type: 'PARTICIPANT_JOINED',
      participant: result.participant,
    }, result.participant.id);

    const remainingPending = this.sessionManager.getPendingRequests(client.sessionId);
    this.sendToParticipant(client.sessionId, client.participantId!, {
      type: 'PENDING_REQUESTS',
      requests: remainingPending.map(p => ({ ...p })),
    });

    logger.info(`Participant accepted: ${result.participant.name}`);
  }

  private handleRejectParticipant(client: ConnectedClient, msg: ClientMessage & { type: 'REJECT_PARTICIPANT' }): void {
    if (!client.isHost || !client.sessionId) {
      this.send(client, { type: 'ERROR', code: 'UNAUTHORIZED', message: 'Only the host can reject participants.' });
      return;
    }

    const pending = this.sessionManager.removePendingRequest(client.sessionId, msg.participantId);
    if (pending) {
      const pendingClient = (pending as any)._ws as ConnectedClient | undefined;
      if (pendingClient) {
        this.send(pendingClient, {
          type: 'JOIN_REJECTED',
          reason: 'Your request was rejected by the host.',
        });
      }
    }

    const remainingPending = this.sessionManager.getPendingRequests(client.sessionId);
    this.sendToParticipant(client.sessionId, client.participantId!, {
      type: 'PENDING_REQUESTS',
      requests: remainingPending.map(p => ({ ...p })),
    });

    logger.info(`Participant rejected: ${msg.participantId}`);
  }

  private handleRemoveParticipant(client: ConnectedClient, msg: ClientMessage & { type: 'REMOVE_PARTICIPANT' }): void {
    if (!client.isHost || !client.sessionId) {
      this.send(client, { type: 'ERROR', code: 'UNAUTHORIZED', message: 'Only the host can remove participants.' });
      return;
    }

    const participant = this.sessionManager.getParticipant(client.sessionId, msg.participantId);
    if (!participant || participant.isHost) {
      this.send(client, { type: 'ERROR', code: 'INVALID', message: 'Cannot remove this participant.' });
      return;
    }

    for (const [, c] of this.clients) {
      if (c.participantId === msg.participantId && c.sessionId === client.sessionId) {
        this.send(c, {
          type: 'PARTICIPANT_REMOVED',
          participantId: msg.participantId,
          reason: 'You have been removed by the host.',
        });
        c.participantId = null;
        c.sessionId = null;
        break;
      }
    }

    this.sessionManager.removeParticipant(client.sessionId, msg.participantId);

    this.broadcast(client.sessionId, {
      type: 'PARTICIPANT_LEFT',
      participantId: msg.participantId,
    });

    logger.info(`Participant removed: ${participant.name}`);
  }

  private handleScreenShareRequest(client: ConnectedClient): void {
    if (!client.sessionId || !client.participantId) return;
    const session = this.sessionManager.getSession(client.sessionId);
    if (!session) return;

    const participant = this.sessionManager.getParticipant(client.sessionId, client.participantId);
    if (!participant) return;

    if (!session.config.allowParticipantScreenShare && !client.isHost) {
      this.send(client, { type: 'SCREEN_SHARE_REJECTED', reason: 'Screen sharing has been disabled by the host.' });
      return;
    }

    if (session.activePresenterId && session.activePresenterId !== client.participantId) {
      const currentPresenter = this.sessionManager.getParticipant(client.sessionId, session.activePresenterId);
      this.send(client, {
        type: 'SCREEN_SHARE_REJECTED',
        reason: `${currentPresenter?.name || 'Someone'} is currently presenting. Request to take over?`,
      });
      return;
    }

    if (client.isHost) {
      this.approveScreenShare(client.sessionId, client.participantId);
      return;
    }

    if (session.config.requireScreenShareApproval) {
      this.sendToParticipant(client.sessionId, session.hostId, {
        type: 'SCREEN_SHARE_REQUESTED',
        participantId: client.participantId,
        participantName: participant.name,
        rollNumber: participant.rollNumber,
      });
    } else {
      this.approveScreenShare(client.sessionId, client.participantId);
    }
  }

  private handleScreenShareApprove(client: ConnectedClient, msg: ClientMessage & { type: 'SCREEN_SHARE_APPROVE' }): void {
    if (!client.isHost || !client.sessionId) return;
    this.approveScreenShare(client.sessionId, msg.participantId);
  }

  private approveScreenShare(sessionId: SessionId, participantId: ParticipantId): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;

    if (session.activePresenterId && session.activePresenterId !== participantId) {
      const prevPresenter = this.sessionManager.getParticipant(sessionId, session.activePresenterId);
      if (prevPresenter) {
        prevPresenter.isScreenSharing = false;
        this.broadcast(sessionId, {
          type: 'SCREEN_SHARE_STOPPED',
          participantId: session.activePresenterId,
        });
      }
    }

    const participant = this.sessionManager.getParticipant(sessionId, participantId);
    if (!participant) return;

    participant.isScreenSharing = true;
    session.activePresenterId = participantId;

    this.broadcast(sessionId, {
      type: 'SCREEN_SHARE_APPROVED',
      participantId,
    });

    this.broadcast(sessionId, {
      type: 'ACTIVE_PRESENTER',
      participantId,
      participantName: participant.name,
    });

    logger.info(`Screen share approved for ${participant.name}`);
  }

  private handleScreenShareReject(client: ConnectedClient, msg: ClientMessage & { type: 'SCREEN_SHARE_REJECT' }): void {
    if (!client.isHost || !client.sessionId) return;

    for (const [, c] of this.clients) {
      if (c.participantId === msg.participantId && c.sessionId === client.sessionId) {
        this.send(c, {
          type: 'SCREEN_SHARE_REJECTED',
          reason: 'Your screen share request was rejected.',
        });
        break;
      }
    }
  }

  private handleScreenShareStop(client: ConnectedClient, msg: ClientMessage & { type: 'SCREEN_SHARE_STOP' }): void {
    if (!client.sessionId) return;
    const session = this.sessionManager.getSession(client.sessionId);
    if (!session) return;

    const targetId = msg.participantId || client.participantId;
    if (!targetId) return;

    if (!client.isHost && targetId !== client.participantId) return;

    const participant = this.sessionManager.getParticipant(client.sessionId, targetId);
    if (!participant) return;

    participant.isScreenSharing = false;
    if (session.activePresenterId === targetId) {
      session.activePresenterId = null;
    }

    this.broadcast(client.sessionId, {
      type: 'SCREEN_SHARE_STOPPED',
      participantId: targetId,
    });

    this.broadcast(client.sessionId, {
      type: 'ACTIVE_PRESENTER',
      participantId: null,
      participantName: null,
    });
  }

  private handleMicToggle(client: ConnectedClient, msg: ClientMessage & { type: 'MIC_TOGGLE' }): void {
    if (!client.sessionId || !client.participantId) return;
    const participant = this.sessionManager.getParticipant(client.sessionId, client.participantId);
    if (!participant) return;

    participant.isMicEnabled = msg.enabled;

    this.broadcast(client.sessionId, {
      type: 'MIC_STATE_CHANGED',
      participantId: client.participantId,
      enabled: msg.enabled,
    });
  }

  private handleCameraToggle(client: ConnectedClient, msg: ClientMessage & { type: 'CAMERA_TOGGLE' }): void {
    if (!client.sessionId || !client.participantId) return;
    const participant = this.sessionManager.getParticipant(client.sessionId, client.participantId);
    if (!participant) return;

    participant.isCameraEnabled = msg.enabled;

    this.broadcast(client.sessionId, {
      type: 'CAMERA_STATE_CHANGED',
      participantId: client.participantId,
      enabled: msg.enabled,
    });
  }

  private handleChatMessage(client: ConnectedClient, msg: ClientMessage & { type: 'CHAT_MESSAGE' }): void {
    if (!client.sessionId || !client.participantId) return;
    const session = this.sessionManager.getSession(client.sessionId);
    if (!session || !session.config.allowChat) {
      this.send(client, { type: 'ERROR', code: 'CHAT_DISABLED', message: 'Chat is currently disabled.' });
      return;
    }

    const participant = this.sessionManager.getParticipant(client.sessionId, client.participantId);
    if (!participant || !participant.hasChatPermission) {
      this.send(client, { type: 'ERROR', code: 'NO_PERMISSION', message: 'You do not have chat permission.' });
      return;
    }

    if (!validateChatMessage(msg.message)) {
      this.send(client, { type: 'ERROR', code: 'INVALID_INPUT', message: 'Invalid message length.' });
      return;
    }

    const chatMsg: ChatMessage = {
      id: generateId(),
      participantId: client.participantId,
      rollNumber: participant.rollNumber,
      name: participant.name,
      message: sanitizeInput(msg.message),
      timestamp: Date.now(),
    };

    this.broadcast(client.sessionId, { type: 'CHAT_BROADCAST', message: chatMsg });
  }

  private handleRaiseHand(client: ConnectedClient): void {
    if (!client.sessionId || !client.participantId) return;
    const participant = this.sessionManager.getParticipant(client.sessionId, client.participantId);
    if (!participant) return;

    participant.hasHandRaised = true;
    this.broadcast(client.sessionId, {
      type: 'HAND_STATE_CHANGED',
      participantId: client.participantId,
      raised: true,
    });
  }

  private handleLowerHand(client: ConnectedClient): void {
    if (!client.sessionId || !client.participantId) return;
    const participant = this.sessionManager.getParticipant(client.sessionId, client.participantId);
    if (!participant) return;

    participant.hasHandRaised = false;
    this.broadcast(client.sessionId, {
      type: 'HAND_STATE_CHANGED',
      participantId: client.participantId,
      raised: false,
    });
  }

  private handlePermissionChange(client: ConnectedClient, msg: ClientMessage & { type: 'PERMISSION_CHANGE' }): void {
    if (!client.isHost || !client.sessionId) {
      this.send(client, { type: 'ERROR', code: 'UNAUTHORIZED', message: 'Only the host can change permissions.' });
      return;
    }

    const success = this.sessionManager.updatePermission(client.sessionId, msg.setting, msg.value, msg.target);
    if (!success) {
      this.send(client, { type: 'ERROR', code: 'INVALID_SETTING', message: 'Invalid permission setting.' });
      return;
    }

    this.broadcast(client.sessionId, {
      type: 'PERMISSION_CHANGED',
      setting: msg.setting,
      value: msg.value,
      target: msg.target,
    });

    const participants = this.sessionManager.getConnectedParticipants(client.sessionId);
    this.broadcast(client.sessionId, { type: 'PARTICIPANT_LIST', participants });

    logger.info(`Permission changed: ${msg.setting} = ${msg.value}`);
  }

  private handleEndSession(client: ConnectedClient): void {
    if (!client.isHost || !client.sessionId) return;

    this.broadcast(client.sessionId, {
      type: 'SESSION_ENDED',
      reason: 'The host has ended this class.',
    });

    this.sessionManager.endSession(client.sessionId);

    for (const [ws, c] of this.clients) {
      if (c.sessionId === client.sessionId) {
        c.sessionId = null;
        c.participantId = null;
        try { ws.close(1000, 'Session ended'); } catch {}
      }
    }

    logger.info('Session ended by host');
  }

  private handleWebRTCSignal(client: ConnectedClient, msg: ClientMessage & { type: 'WEBRTC_SIGNAL' }): void {
    if (!client.sessionId || !client.participantId) {
      this.send(client, { type: 'ERROR', code: 'UNAUTHORIZED', message: 'Not connected to a session.' });
      return;
    }

    this.sendToParticipant(client.sessionId, msg.to, {
      type: 'WEBRTC_SIGNAL',
      from: client.participantId,
      signal: msg.signal,
    });
  }

  private handleDisconnect(client: ConnectedClient): void {
    if (!client.sessionId || !client.participantId) return;

    const session = this.sessionManager.getSession(client.sessionId);
    if (!session) return;

    if (client.isHost) {
      const hostSessionId = client.sessionId;
      this.sessionManager.startHostDisconnect(hostSessionId, () => {
        const s = this.sessionManager.getSession(hostSessionId);
        if (s && s.isActive) {
          this.broadcast(hostSessionId, {
            type: 'SESSION_ENDED',
            reason: 'The host has disconnected for too long.',
          });
          this.sessionManager.endSession(hostSessionId);
          for (const [ws, c] of this.clients) {
            if (c.sessionId === hostSessionId) {
              c.sessionId = null;
              c.participantId = null;
              try { ws.close(1000, 'Session ended'); } catch {}
            }
          }
        }
      });
      return;
    }

    const participant = this.sessionManager.getParticipant(client.sessionId, client.participantId);
    if (participant && participant.isConnected) {
      this.sessionManager.removeParticipant(client.sessionId, client.participantId);

      if (session.activePresenterId === client.participantId) {
        session.activePresenterId = null;
        participant.isScreenSharing = false;
        this.broadcast(client.sessionId, {
          type: 'SCREEN_SHARE_STOPPED',
          participantId: client.participantId,
        });
        this.broadcast(client.sessionId, {
          type: 'ACTIVE_PRESENTER',
          participantId: null,
          participantName: null,
        });
      }

      this.broadcast(client.sessionId, {
        type: 'PARTICIPANT_LEFT',
        participantId: client.participantId,
      });

      logger.info(`Participant disconnected: ${participant.name}`);
    }
  }

  private handleReconnectHost(client: ConnectedClient, msg: ClientMessage & { type: 'RECONNECT_HOST' }): void {
    const session = this.sessionManager.getSession(msg.sessionId);
    if (!session || !session.isActive) {
      this.send(client, { type: 'JOIN_REJECTED', reason: 'Session not found or has ended.' });
      return;
    }

    if (session.hostId !== msg.hostId) {
      this.send(client, { type: 'JOIN_REJECTED', reason: 'Invalid host ID.' });
      return;
    }

    this.sessionManager.cancelHostDisconnect(msg.sessionId);

    client.participantId = msg.hostId;
    client.sessionId = msg.sessionId;
    client.isHost = true;

    const hostParticipant = this.sessionManager.getParticipant(msg.sessionId, msg.hostId);
    if (hostParticipant) {
      hostParticipant.isConnected = true;
      hostParticipant.leftAt = null;
    }

    const participants = this.sessionManager.getConnectedParticipants(msg.sessionId);
    this.send(client, {
      type: 'HOST_RECONNECTED',
      sessionId: msg.sessionId,
      hostId: msg.hostId,
    });
    this.send(client, {
      type: 'JOIN_ACCEPTED',
      participantId: msg.hostId,
      sessionId: msg.sessionId,
      participants,
      config: session.config,
    });

    logger.info(`Host reconnected to session: ${session.config.roomName}`);
  }
}
