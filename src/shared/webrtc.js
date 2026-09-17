import { doc, collection, addDoc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export function createPeerConnection() {
  return new RTCPeerConnection(RTC_CONFIG);
}

export async function startCall(accidentId, pc, localStream) {
  const callRef = doc(db, 'calls', accidentId);
  const offerCandidates = collection(callRef, 'offerCandidates');
  const answerCandidates = collection(callRef, 'answerCandidates');

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) addDoc(offerCandidates, event.candidate.toJSON());
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  await setDoc(callRef, {
    offer: { sdp: offerDescription.sdp, type: offerDescription.type },
    answer: null,
  });

  onSnapshot(callRef, (snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });

  onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
    });
  });
}

export async function joinCall(accidentId, pc, localStream) {
  const callRef = doc(db, 'calls', accidentId);
  const offerCandidates = collection(callRef, 'offerCandidates');
  const answerCandidates = collection(callRef, 'answerCandidates');

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (event) => {
    if (event.candidate) addDoc(answerCandidates, event.candidate.toJSON());
  };

  const callSnap = await getDoc(callRef);
  const callData = callSnap.data();
  if (!callData?.offer) throw new Error('No call in progress for this case yet.');

  await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  await updateDoc(callRef, {
    answer: { sdp: answerDescription.sdp, type: answerDescription.type },
  });

  onSnapshot(offerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
    });
  });
}
