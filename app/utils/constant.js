const constants = {
  BroadcastTypes: {
    IncomingCall: 'incomingCall',
    PeerJoined: 'peerJoined',
    PeerLeft: 'peerLeft',
    NewProducer: 'newProducer',
    PeerPausedProducer: 'peerPausedProducer',
    PeerResumedProducer: 'peerResumedProducer',
    PeerClosedProducer: 'peerClosedProducer',
    PeerVideoOrientationChanged: 'peerVideoOrientationChanged',
    ActiveSpeaker: 'activeSpeaker',
    AudioLevel: 'audioLevel',
    AudioSilence: 'audioSilence',
    ReceivedCall: 'receivedCall',
    RejectedCall: 'rejectedCall',
    AcceptedCall: 'acceptedCall',
    EndedCall: 'endedCall',
    CanceledCall: 'canceledCall',
    BusiedCall: 'busiedCall'
  },
};

module.exports = constants;
