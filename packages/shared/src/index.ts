// ─── Validation Constants ────────────────────────────────────────────
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 60;
export const MIN_ROLL_LENGTH = 2;
export const MAX_ROLL_LENGTH = 30;
export const MIN_ROOM_NAME_LENGTH = 2;
export const MAX_ROOM_NAME_LENGTH = 60;
export const MIN_CHAT_LENGTH = 1;
export const MAX_CHAT_LENGTH = 1000;
export const PIN_LENGTH = 6;
export const DEFAULT_MAX_PARTICIPANTS = 50;
export const DEFAULT_PORT = 3000;

// ─── Participant ─────────────────────────────────────────────────────
export type ParticipantId = string;

export interface Participant {
  id: ParticipantId;
  rollNumber: string;
  name: string;
  joinedAt: number;
  leftAt: number | null;
  isConnected: boolean;
  isHost: boolean;
  hasHandRaised: boolean;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  hasScreenSharePermission: boolean;
  hasMicPermission: boolean;
  hasCameraPermission: boolean;
  hasChatPermission: boolean;
}

// ─── Session / Room ──────────────────────────────────────────────────
export type SessionId = string;

export interface SessionConfig {
  roomName: string;
  pin: string;
  maxParticipants: number;
  requireJoinApproval: boolean;
  allowParticipantScreenShare: boolean;
  requireScreenShareApproval: boolean;
  allowMicrophone: boolean;
  allowCamera: boolean;
  allowChat: boolean;
  port: number;
}

export interface Session {
  id: SessionId;
  config: SessionConfig;
  hostId: ParticipantId;
  participants: Map<ParticipantId, Participant>;
  pendingRequests: Participant[];
  createdAt: number;
  isActive: boolean;
  activePresenterId: ParticipantId | null;
}

// ─── Chat ────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  participantId: ParticipantId;
  rollNumber: string;
  name: string;
  message: string;
  timestamp: number;
}

// ─── Attendance Record ───────────────────────────────────────────────
export interface AttendanceRecord {
  rollNumber: string;
  name: string;
  joinedAt: number;
  leftAt: number | null;
  isConnected: boolean;
}

// ─── WebRTC Signaling ────────────────────────────────────────────────
export type WebRTCSignal =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

// ─── WebSocket Messages (Client → Server) ────────────────────────────
export type ClientMessage =
  | CreateSessionMessage
  | JoinRequestMessage
  | JoinWithPinMessage
  | AcceptParticipantMessage
  | RejectParticipantMessage
  | RemoveParticipantMessage
  | ScreenShareRequestMessage
  | ScreenShareApproveMessage
  | ScreenShareRejectMessage
  | ScreenShareStopMessage
  | MicToggleMessage
  | CameraToggleMessage
  | ChatMessagePayload
  | RaiseHandMessage
  | LowerHandMessage
  | PermissionChangeMessage
  | EndSessionMessage
  | ReconnectHostMessage
  | PingMessage
  | WebRTCSignalClientMessage;

export interface CreateSessionMessage {
  type: 'CREATE_SESSION';
  roomName: string;
  pin?: string;
  maxParticipants?: number;
  port?: number;
}

export interface JoinRequestMessage {
  type: 'JOIN_REQUEST';
  sessionId: SessionId;
  rollNumber: string;
  name: string;
}

export interface JoinWithPinMessage {
  type: 'JOIN_WITH_PIN';
  sessionId: SessionId;
  pin: string;
  rollNumber: string;
  name: string;
}

export interface AcceptParticipantMessage {
  type: 'ACCEPT_PARTICIPANT';
  participantId: ParticipantId;
}

export interface RejectParticipantMessage {
  type: 'REJECT_PARTICIPANT';
  participantId: ParticipantId;
}

export interface RemoveParticipantMessage {
  type: 'REMOVE_PARTICIPANT';
  participantId: ParticipantId;
}

export interface ScreenShareRequestMessage {
  type: 'SCREEN_SHARE_REQUEST';
}

export interface ScreenShareApproveMessage {
  type: 'SCREEN_SHARE_APPROVE';
  participantId: ParticipantId;
}

export interface ScreenShareRejectMessage {
  type: 'SCREEN_SHARE_REJECT';
  participantId: ParticipantId;
}

export interface ScreenShareStopMessage {
  type: 'SCREEN_SHARE_STOP';
  participantId?: ParticipantId;
}

export interface MicToggleMessage {
  type: 'MIC_TOGGLE';
  enabled: boolean;
}

export interface CameraToggleMessage {
  type: 'CAMERA_TOGGLE';
  enabled: boolean;
}

export interface ChatMessagePayload {
  type: 'CHAT_MESSAGE';
  message: string;
}

export interface RaiseHandMessage {
  type: 'RAISE_HAND';
}

export interface LowerHandMessage {
  type: 'LOWER_HAND';
}

export interface PermissionChangeMessage {
  type: 'PERMISSION_CHANGE';
  target?: ParticipantId;
  setting: string;
  value: boolean;
}

export interface EndSessionMessage {
  type: 'END_SESSION';
}

export interface ReconnectHostMessage {
  type: 'RECONNECT_HOST';
  sessionId: SessionId;
  hostId: ParticipantId;
}

export interface PingMessage {
  type: 'PING';
}

export interface WebRTCSignalClientMessage {
  type: 'WEBRTC_SIGNAL';
  to: ParticipantId;
  signal: WebRTCSignal;
}

// ─── WebSocket Messages (Server → Client) ────────────────────────────
export type ServerMessage =
  | SessionCreatedMessage
  | SessionInfoMessage
  | JoinRequestSentMessage
  | JoinAcceptedMessage
  | JoinRejectedMessage
  | ParticipantJoinedMessage
  | ParticipantLeftMessage
  | ParticipantRemovedMessage
  | ParticipantUpdatedMessage
  | PendingRequestsMessage
  | JoinRequestedMessage
  | ScreenShareRequestedMessage
  | ScreenShareApprovedMessage
  | ScreenShareRejectedMessage
  | ScreenShareStoppedMessage
  | ScreenShareStartedMessage
  | MicStateChangedMessage
  | CameraStateChangedMessage
  | ChatBroadcastMessage
  | HandStateChangedMessage
  | PermissionChangedMessage
  | ActivePresenterMessage
  | SessionEndedMessage
  | HostReconnectedMessage
  | ErrorMessage
  | PongMessage
  | ParticipantListMessage
  | AttendanceUpdateMessage
  | WebRTCSignalServerMessage;

export interface SessionCreatedMessage {
  type: 'SESSION_CREATED';
  sessionId: SessionId;
  hostId: ParticipantId;
  localUrl: string;
  localIp: string;
  port: number;
}

export interface SessionInfoMessage {
  type: 'SESSION_INFO';
  sessionId: SessionId;
  roomName: string;
  port: number;
  localIp: string;
  participantCount: number;
  maxParticipants: number;
  isActive: boolean;
}

export interface JoinRequestSentMessage {
  type: 'JOIN_REQUEST_SENT';
  message: string;
}

export interface JoinAcceptedMessage {
  type: 'JOIN_ACCEPTED';
  participantId: ParticipantId;
  sessionId: SessionId;
  participants: Participant[];
  config: SessionConfig;
}

export interface JoinRejectedMessage {
  type: 'JOIN_REJECTED';
  reason: string;
}

export interface ParticipantJoinedMessage {
  type: 'PARTICIPANT_JOINED';
  participant: Participant;
}

export interface ParticipantLeftMessage {
  type: 'PARTICIPANT_LEFT';
  participantId: ParticipantId;
}

export interface ParticipantRemovedMessage {
  type: 'PARTICIPANT_REMOVED';
  participantId: ParticipantId;
  reason: string;
}

export interface ParticipantUpdatedMessage {
  type: 'PARTICIPANT_UPDATED';
  participant: Participant;
}

export interface PendingRequestsMessage {
  type: 'PENDING_REQUESTS';
  requests: Participant[];
}

export interface JoinRequestedMessage {
  type: 'JOIN_REQUESTED';
  participantId: ParticipantId;
  participantName: string;
  rollNumber: string;
}

export interface ScreenShareRequestedMessage {
  type: 'SCREEN_SHARE_REQUESTED';
  participantId: ParticipantId;
  participantName: string;
  rollNumber: string;
}

export interface ScreenShareApprovedMessage {
  type: 'SCREEN_SHARE_APPROVED';
  participantId: ParticipantId;
}

export interface ScreenShareRejectedMessage {
  type: 'SCREEN_SHARE_REJECTED';
  reason: string;
}

export interface ScreenShareStoppedMessage {
  type: 'SCREEN_SHARE_STOPPED';
  participantId: ParticipantId;
}

export interface ScreenShareStartedMessage {
  type: 'SCREEN_SHARE_STARTED';
  participantId: ParticipantId;
}

export interface MicStateChangedMessage {
  type: 'MIC_STATE_CHANGED';
  participantId: ParticipantId;
  enabled: boolean;
}

export interface CameraStateChangedMessage {
  type: 'CAMERA_STATE_CHANGED';
  participantId: ParticipantId;
  enabled: boolean;
}

export interface ChatBroadcastMessage {
  type: 'CHAT_BROADCAST';
  message: ChatMessage;
}

export interface HandStateChangedMessage {
  type: 'HAND_STATE_CHANGED';
  participantId: ParticipantId;
  raised: boolean;
}

export interface PermissionChangedMessage {
  type: 'PERMISSION_CHANGED';
  setting: string;
  value: boolean;
  target?: ParticipantId;
}

export interface ActivePresenterMessage {
  type: 'ACTIVE_PRESENTER';
  participantId: ParticipantId | null;
  participantName: string | null;
}

export interface SessionEndedMessage {
  type: 'SESSION_ENDED';
  reason: string;
}

export interface HostReconnectedMessage {
  type: 'HOST_RECONNECTED';
  sessionId: SessionId;
  hostId: ParticipantId;
}

export interface ErrorMessage {
  type: 'ERROR';
  code: string;
  message: string;
}

export interface PongMessage {
  type: 'PONG';
}

export interface ParticipantListMessage {
  type: 'PARTICIPANT_LIST';
  participants: Participant[];
}

export interface AttendanceUpdateMessage {
  type: 'ATTENDANCE_UPDATE';
  records: AttendanceRecord[];
}

export interface WebRTCSignalServerMessage {
  type: 'WEBRTC_SIGNAL';
  from: ParticipantId;
  signal: WebRTCSignal;
}

// ─── Utility ─────────────────────────────────────────────────────────
export function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generatePin(): string {
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += Math.floor(Math.random() * 10).toString();
  }
  return pin;
}

export function validateName(name: string): boolean {
  return typeof name === 'string' && name.trim().length >= MIN_NAME_LENGTH && name.trim().length <= MAX_NAME_LENGTH;
}

export function validateRollNumber(roll: string): boolean {
  return typeof roll === 'string' && roll.trim().length >= MIN_ROLL_LENGTH && roll.trim().length <= MAX_ROLL_LENGTH;
}

export function validateRoomName(name: string): boolean {
  return typeof name === 'string' && name.trim().length >= MIN_ROOM_NAME_LENGTH && name.trim().length <= MAX_ROOM_NAME_LENGTH;
}

export function validatePin(pin: string): boolean {
  return typeof pin === 'string' && pin.length === PIN_LENGTH && /^\d+$/.test(pin);
}

export function validateChatMessage(msg: string): boolean {
  return typeof msg === 'string' && msg.trim().length >= MIN_CHAT_LENGTH && msg.trim().length <= MAX_CHAT_LENGTH;
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .trim();
}
