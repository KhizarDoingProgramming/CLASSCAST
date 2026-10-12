import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from './session.js';

describe('SessionManager', () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager();
  });

  describe('createSession', () => {
    it('should create a session with valid config', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      assert.ok(session.id);
      assert.equal(session.config.roomName, 'CS-5A');
      assert.equal(session.config.port, 3000);
      assert.ok(session.config.pin);
      assert.equal(session.config.pin.length, 6);
      assert.ok(session.isActive);
    });

    it('should use provided PIN when valid', () => {
      const session = sm.createSession({ roomName: 'CS-5A', pin: '123456', port: 3000 });
      assert.equal(session.config.pin, '123456');
    });

    it('should auto-generate PIN when invalid', () => {
      const session = sm.createSession({ roomName: 'CS-5A', pin: 'abc', port: 3000 });
      assert.equal(session.config.pin.length, 6);
      assert.ok(/^\d+$/.test(session.config.pin));
    });

    it('should set default max participants', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      assert.equal(session.config.maxParticipants, 50);
    });

    it('should set custom max participants', () => {
      const session = sm.createSession({ roomName: 'CS-5A', maxParticipants: 25, port: 3000 });
      assert.equal(session.config.maxParticipants, 25);
    });

    it('should default to join approval required', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      assert.ok(session.config.requireJoinApproval);
    });

    it('should default to all permissions enabled', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      assert.ok(session.config.allowParticipantScreenShare);
      assert.ok(session.config.allowMicrophone);
      assert.ok(session.config.allowCamera);
      assert.ok(session.config.allowChat);
    });
  });

  describe('addParticipant', () => {
    it('should add a valid participant', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const result = sm.addParticipant(session.id, '23-CS-104', 'Ali Raza');
      assert.ok(result.success);
      assert.ok(result.participant);
      assert.equal(result.participant.rollNumber, '23-CS-104');
      assert.equal(result.participant.name, 'Ali Raza');
      assert.ok(result.participant.id);
      assert.ok(result.participant.isConnected);
    });

    it('should reject duplicate roll numbers', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      sm.addParticipant(session.id, '23-CS-104', 'Ali Raza');
      const result = sm.addParticipant(session.id, '23-CS-104', 'Another Ali');
      assert.ok(!result.success);
      assert.equal(result.error, 'That roll number is already connected.');
    });

    it('should reject when session is not found', () => {
      const result = sm.addParticipant('nonexistent', '23-CS-104', 'Ali Raza');
      assert.ok(!result.success);
      assert.equal(result.error, 'Session not found.');
    });

    it('should reject when session is ended', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      sm.endSession(session.id);
      const result = sm.addParticipant(session.id, '23-CS-104', 'Ali Raza');
      assert.ok(!result.success);
      assert.equal(result.error, 'This session has ended.');
    });

    it('should reject invalid roll number', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const result = sm.addParticipant(session.id, 'A', 'Ali Raza');
      assert.ok(!result.success);
      assert.ok(result.error?.includes('roll number'));
    });

    it('should reject invalid name', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const result = sm.addParticipant(session.id, '23-CS-104', 'A');
      assert.ok(!result.success);
      assert.ok(result.error?.includes('name'));
    });

    it('should enforce participant limit', () => {
      const session = sm.createSession({ roomName: 'CS-5A', maxParticipants: 2, port: 3000 });
      sm.addParticipant(session.id, '001', 'Student One');
      sm.addParticipant(session.id, '002', 'Student Two');
      const result = sm.addParticipant(session.id, '003', 'Student Three');
      assert.ok(!result.success);
      assert.equal(result.error, 'Classroom is full.');
    });

    it('should allow re-adding a disconnected participant with same roll', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const r1 = sm.addParticipant(session.id, '23-CS-104', 'Ali Raza');
      assert.ok(r1.success);
      sm.removeParticipant(session.id, r1.participant!.id);
      const r2 = sm.addParticipant(session.id, '23-CS-104', 'Ali Raza');
      assert.ok(r2.success);
    });
  });

  describe('addHostParticipant', () => {
    it('should add host participant', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const host = sm.addHostParticipant(session.id);
      assert.ok(host.isHost);
      assert.equal(host.rollNumber, 'HOST');
    });
  });

  describe('removeParticipant', () => {
    it('should mark participant as disconnected', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const result = sm.addParticipant(session.id, '23-CS-104', 'Ali Raza');
      sm.removeParticipant(session.id, result.participant!.id);

      const p = sm.getParticipant(session.id, result.participant!.id);
      assert.ok(p);
      assert.ok(!p.isConnected);
      assert.ok(p.leftAt);
    });

    it('should return false for non-existent session', () => {
      assert.equal(sm.removeParticipant('nonexistent', 'fake-id'), false);
    });
  });

  describe('getConnectedParticipants', () => {
    it('should return only connected participants', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const r1 = sm.addParticipant(session.id, '001', 'One');
      const r2 = sm.addParticipant(session.id, '002', 'Two');
      sm.removeParticipant(session.id, r1.participant!.id);

      const connected = sm.getConnectedParticipants(session.id);
      assert.equal(connected.length, 1);
      assert.equal(connected[0].rollNumber, '002');
    });
  });

  describe('permissions', () => {
    it('should toggle microphone permission', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const result = sm.updatePermission(session.id, 'allowMicrophone', false);
      assert.ok(result);
      assert.equal(session.config.allowMicrophone, false);
    });

    it('should toggle chat permission', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      sm.updatePermission(session.id, 'allowChat', false);
      assert.equal(session.config.allowChat, false);
    });

    it('should reject unknown permission', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const result = sm.updatePermission(session.id, 'unknownPermission', true);
      assert.equal(result, false);
    });
  });

  describe('endSession', () => {
    it('should mark session as inactive', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      sm.endSession(session.id);
      assert.ok(!session.isActive);
    });

    it('should disconnect all participants', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      sm.addParticipant(session.id, '001', 'One');
      sm.addParticipant(session.id, '002', 'Two');
      sm.endSession(session.id);

      const connected = sm.getConnectedParticipants(session.id);
      assert.equal(connected.length, 0);
    });
  });

  describe('pending requests', () => {
    it('should add and remove pending requests', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      const participant: import('@classcast/shared').Participant = {
        id: 'test-id',
        rollNumber: '001',
        name: 'Test',
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

      sm.addPendingRequest(session.id, participant);
      assert.equal(sm.getPendingRequests(session.id).length, 1);

      const removed = sm.removePendingRequest(session.id, 'test-id');
      assert.ok(removed);
      assert.equal(sm.getPendingRequests(session.id).length, 0);
    });
  });

  describe('attendance', () => {
    it('should return attendance records', () => {
      const session = sm.createSession({ roomName: 'CS-5A', port: 3000 });
      sm.addParticipant(session.id, '001', 'One');
      sm.addParticipant(session.id, '002', 'Two');

      const records = sm.getAttendance(session.id);
      assert.equal(records.length, 2);
      assert.equal(records[0].rollNumber, '001');
      assert.equal(records[1].rollNumber, '002');
    });
  });
});
