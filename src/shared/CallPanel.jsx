import { useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createPeerConnection, startCall, joinCall } from './webrtc';
import { IconPhone } from './Icons';

function CallPanel({ accidentId }) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState('');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);

  const handleStart = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection();
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
      };

      const callSnap = await getDoc(doc(db, 'calls', accidentId));
      if (callSnap.exists() && callSnap.data()?.offer) {
        await joinCall(accidentId, pc, stream);
      } else {
        await startCall(accidentId, pc, stream);
      }

      setInCall(true);
    } catch (err) {
      setError('Could not start the call: ' + err.message);
    }
  };

  const handleEnd = () => {
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    pcRef.current = null;
    streamRef.current = null;
    setInCall(false);
  };

  const toggleMute = () => {
    const audioTrack = streamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
  };

  const toggleVideo = () => {
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setVideoOff(!videoTrack.enabled);
  };

  return (
    <div className="card">
      <p className="card-title">
        <IconPhone size={16} /> Live call
      </p>

      {inCall && (
        <div className="call-videos">
          <video ref={remoteVideoRef} autoPlay playsInline className="call-video-remote" />
          <video ref={localVideoRef} autoPlay playsInline muted className="call-video-local" />
        </div>
      )}

      <div className="alert-actions">
        {!inCall ? (
          <button className="btn btn-success" onClick={handleStart}>
            <IconPhone size={14} /> Start call
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={toggleMute}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button className="btn btn-ghost" onClick={toggleVideo}>
              {videoOff ? 'Camera on' : 'Camera off'}
            </button>
            <button className="btn btn-danger" onClick={handleEnd}>
              End call
            </button>
          </>
        )}
      </div>

      {error && <p className="status-line status-error">{error}</p>}
    </div>
  );
}

export default CallPanel;
