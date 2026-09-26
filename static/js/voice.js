// static/js/voice.js
// Voice Chat Module with Web Audio API real-time VU Meter and WebRTC P2P Audio Streaming

import { STATE } from './globals.js';
import { socket } from './network.js';
import { showNotification } from './notifications.js';

// ==========================================
// VOICE STATE
// ==========================================
let localStream = null;
let audioContext = null;
let analyserNode = null;
let sourceNode = null;
let peerConnection = null;

// Remote audio playback state (Web Audio API forces mobile loudspeaker output)
let remoteAudioContext = null;
let remoteAudioSource = null;
let remoteGainNode = null;
let silentAudioStream = null;

let isMicMuted = true; // Mặc định tắt micro để tôn trọng quyền riêng tư
let isAudioDeafened = false;
let isVoiceInitialized = false;
let isBotMatch = false;

let animationFrameId = null;
let currentMeterVolume = 0;

// WebRTC Configuration using public Google STUN servers
const RTC_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ==========================================
// INITIALIZATION
// ==========================================
export function initVoiceChat() {
    const micBtn = document.getElementById('voiceMicBtn');
    const audioBtn = document.getElementById('voiceAudioBtn');

    if (micBtn) {
        micBtn.addEventListener('click', handleMicButtonClick);
    }

    if (audioBtn) {
        audioBtn.addEventListener('click', handleAudioButtonClick);
    }

    // Setup global touch/pointer unlocker for mobile browsers
    setupMobileAudioUnlock();

    // Set initial UI state (Muted by default)
    updateMicUi(isMicMuted);

    // Listen for WebRTC signals from opponent
    socket.on('voice_signal', handleIncomingVoiceSignal);

    // Start passive animation loop for the VU meter
    startMeterLoop();
}

function setupMobileAudioUnlock() {
    const unlock = () => {
        if (remoteAudioContext && remoteAudioContext.state === 'suspended') {
            remoteAudioContext.resume().catch(() => {});
        }
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
        const remoteAudio = document.getElementById('remoteVoiceAudio');
        if (remoteAudio && remoteAudio.paused) {
            remoteAudio.play().catch(() => {});
        }
    };

    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('click', unlock, { passive: true });
}

// ==========================================
// SILENT TRACK GENERATOR (GUARANTEES SENDRECV SDP)
// ==========================================
function getOrCreateAudioTrackToAttach() {
    if (localStream) {
        const t = localStream.getAudioTracks()[0];
        if (t) {
            t.enabled = !isMicMuted;
            return { track: t, stream: localStream };
        }
    }

    // Create a silent dummy audio track so SDP offer/answer ALWAYS negotiates a=sendrecv
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            if (!silentAudioStream) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const dst = ctx.createMediaStreamDestination();
                osc.connect(dst);
                osc.start();
                silentAudioStream = dst.stream;
            }
            const track = silentAudioStream.getAudioTracks()[0];
            if (track) {
                track.enabled = false; // Completely muted silence
                return { track, stream: silentAudioStream };
            }
        }
    } catch (e) {
        console.warn("[Voice] Silent audio track creation failed:", e);
    }
    return null;
}

// ==========================================
// MICROPHONE ACCESS & AUDIO ANALYZER
// ==========================================
function attachLocalTracksToPeer() {
    if (!peerConnection || !localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !isMicMuted;

    // Find the audio sender to replace the track
    const transceivers = peerConnection.getTransceivers ? peerConnection.getTransceivers() : [];
    let audioSender = null;
    for (const t of transceivers) {
        if (t.sender && (t.sender.track?.kind === 'audio' || t.receiver?.track?.kind === 'audio' || !t.sender.track)) {
            audioSender = t.sender;
            t.direction = 'sendrecv';
            break;
        }
    }
    if (!audioSender) {
        const senders = peerConnection.getSenders();
        audioSender = senders.find(s => (s.track && s.track.kind === 'audio') || !s.track) || senders[0];
    }

    if (audioSender && typeof audioSender.replaceTrack === 'function') {
        audioSender.replaceTrack(audioTrack).then(() => {
            console.log("[Voice] Attached active mic track via replaceTrack successfully.");
        }).catch(err => {
            console.warn("[Voice] replaceTrack error, falling back to addTrack:", err);
            try {
                peerConnection.addTrack(audioTrack, localStream);
            } catch (e) {}
        });
    } else {
        try {
            if (!peerConnection.getSenders().some(s => s.track === audioTrack)) {
                peerConnection.addTrack(audioTrack, localStream);
                console.log("[Voice] Attached audio track via addTrack.");
            }
        } catch (e) {
            console.warn("[Voice] addTrack error:", e);
        }
    }
}

async function startMicrophone(initialUnmute = false) {
    if (localStream) return true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });

        // Setup Web Audio API Context & Analyser
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
            audioContext = new AudioCtxClass();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            sourceNode = audioContext.createMediaStreamSource(localStream);
            analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 512;
            analyserNode.smoothingTimeConstant = 0.3;

            // Connect mic source ONLY to analyzer, NOT to destination (avoids self-echo)
            sourceNode.connect(analyserNode);
        }

        if (initialUnmute) {
            isMicMuted = false;
        }

        // Apply muted state to stream tracks (muted by default)
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMicMuted;
        });

        // If peer connection is already active, attach tracks
        if (peerConnection) {
            attachLocalTracksToPeer();
        }

        isVoiceInitialized = true;
        updateMicUi(isMicMuted);
        return true;
    } catch (err) {
        console.warn("[Voice] Microphone access failed or denied:", err);
        showNotification("Không thể truy cập Microphone! Hãy cấp quyền trong trình duyệt.", "warning");
        return false;
    }
}

// ==========================================
// REAL-TIME VU METER ANIMATION LOOP
// ==========================================
function startMeterLoop() {
    const meterBar = document.getElementById('voiceMeterBar');
    // Buffer for 256 time-domain samples (~5ms window at 48kHz)
    const dataArray = new Uint8Array(256);

    function renderMeter() {
        if (!isMicMuted && analyserNode && localStream) {
            analyserNode.getByteTimeDomainData(dataArray);

            // Compute RMS (Root Mean Square) volume across samples
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
                // Baseline silence in Uint8 is 128 (range 0 - 255 -> normalized -1.0 to +1.0)
                const sample = (dataArray[i] - 128) / 128;
                sumSquares += sample * sample;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);

            // Convert to Decibels (dBFS)
            const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;

            // Balanced dynamic range for human speech:
            // - Silence / background room noise: < -48 dB -> 0%
            // - Whispering / quiet speech: -42 dB to -32 dB -> 15% - 42% (Red zone: Nhỏ)
            // - Normal conversational speech: -30 dB to -18 dB -> 45% - 75% (Amber/Yellow zone: Vừa)
            // - Loud speaking / shout: -16 dB to -8 dB -> 80% - 100% (Green zone: Lớn)
            const minDb = -48;
            const maxDb = -8;
            let targetHeight = 0;

            if (db > minDb) {
                const norm = Math.min(1.0, (db - minDb) / (maxDb - minDb));
                targetHeight = norm * 100;
            }

            // Professional VU meter ballistics:
            // - Fast attack (0.35): jumps immediately with speech syllables
            // - Smooth decay (0.12): gracefully glides down between words without erratic flicker
            if (targetHeight > currentMeterVolume) {
                currentMeterVolume += (targetHeight - currentMeterVolume) * 0.35;
            } else {
                currentMeterVolume += (targetHeight - currentMeterVolume) * 0.12;
            }
        } else {
            // Smoothly drop to 0 when muted or no mic
            currentMeterVolume += (0 - currentMeterVolume) * 0.2;
            if (currentMeterVolume < 0.5) currentMeterVolume = 0;
        }

        if (meterBar) {
            const h = Math.max(0, Math.min(100, Math.round(currentMeterVolume)));
            meterBar.style.height = `${h}%`;

            // Dynamic glow styling matching the vertical color gradient
            if (h > 75) {
                // High volume (Green zone)
                meterBar.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.9), inset 0 0 6px rgba(255, 255, 255, 0.6)';
            } else if (h > 35) {
                // Medium volume (Yellow / Orange zone)
                meterBar.style.boxShadow = '0 0 8px rgba(255, 165, 2, 0.8), inset 0 0 4px rgba(255, 255, 255, 0.4)';
            } else if (h > 5) {
                // Low volume (Red zone)
                meterBar.style.boxShadow = '0 0 6px rgba(255, 56, 56, 0.7)';
            } else {
                meterBar.style.boxShadow = 'none';
            }
        }

        animationFrameId = requestAnimationFrame(renderMeter);
    }

    renderMeter();
}

// ==========================================
// CONTROLS: MIC & SPEAKER BUTTONS
// ==========================================
async function handleMicButtonClick() {
    // If mic not yet permitted / started, request it and unmute
    if (!localStream) {
        const success = await startMicrophone(true);
        if (!success) return;
        showNotification("Micro: ĐÃ BẬT (Unmuted)");
        return;
    }

    isMicMuted = !isMicMuted;

    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isMicMuted;
        });
    }

    if (peerConnection && localStream) {
        attachLocalTracksToPeer();
    }

    updateMicUi(isMicMuted);

    if (isMicMuted) {
        showNotification("Micro: ĐÃ TẮT (Muted)");
    } else {
        showNotification("Micro: ĐÃ BẬT (Unmuted)");
    }
}

function updateMicUi(muted) {
    const micBtn = document.getElementById('voiceMicBtn');
    const svgOn = document.getElementById('svgMicOn');
    const svgOff = document.getElementById('svgMicOff');

    if (micBtn) {
        if (muted) {
            micBtn.classList.add('muted');
            micBtn.title = "Microphone: ĐÃ TẮT (Click để Bật)";
            if (svgOn) svgOn.style.display = 'none';
            if (svgOff) svgOff.style.display = 'block';
        } else {
            micBtn.classList.remove('muted');
            micBtn.title = "Microphone: ĐANG BẬT (Click để Tắt)";
            if (svgOn) svgOn.style.display = 'block';
            if (svgOff) svgOff.style.display = 'none';
        }
    }
}

function handleAudioButtonClick() {
    isAudioDeafened = !isAudioDeafened;

    const remoteAudio = document.getElementById('remoteVoiceAudio');
    if (remoteAudio) {
        remoteAudio.muted = isAudioDeafened;
    }

    if (remoteGainNode) {
        remoteGainNode.gain.value = isAudioDeafened ? 0 : 1.0;
    }

    const audioBtn = document.getElementById('voiceAudioBtn');
    const svgOn = document.getElementById('svgSpeakerOn');
    const svgOff = document.getElementById('svgSpeakerOff');

    if (audioBtn) {
        if (isAudioDeafened) {
            audioBtn.classList.add('muted');
            audioBtn.title = "Âm thanh đối thủ: ĐÃ TẮT (Click để Nghe)";
            if (svgOn) svgOn.style.display = 'none';
            if (svgOff) svgOff.style.display = 'block';
            showNotification("Âm thanh đối thủ: ĐÃ TẮT");
        } else {
            audioBtn.classList.remove('muted');
            audioBtn.title = "Âm thanh đối thủ: ĐANG BẬT (Click để Tắt tiếng)";
            if (svgOn) svgOn.style.display = 'block';
            if (svgOff) svgOff.style.display = 'none';
            showNotification("Âm thanh đối thủ: ĐÃ BẬT");
        }
    }
}

// ==========================================
// WEBRTC PEER CONNECTION (PvP VOICE STREAM)
// ==========================================
let pendingIceCandidates = [];
let hasNotifiedConnected = false;

function updateVoiceConnectionUi(state) {
    const widget = document.getElementById('voiceWidget');
    const dot = document.getElementById('voiceStatusDot');
    if (!widget || !dot) return;

    if (state === 'connected') {
        widget.classList.add('connected');
        widget.classList.remove('connecting');
        dot.title = "Voice P2P 1-1: ĐÃ KẾT NỐI (Sẵn sàng đàm thoại)";
        if (!hasNotifiedConnected) {
            showNotification("🎙️ Voice Chat P2P: ĐÃ KẾT NỐI 1-1 THÀNH CÔNG!", "success");
            hasNotifiedConnected = true;
        }
    } else if (state === 'connecting') {
        widget.classList.remove('connected');
        widget.classList.add('connecting');
        dot.title = "Voice P2P 1-1: Đang thiết lập kết nối...";
    } else {
        widget.classList.remove('connected');
        widget.classList.remove('connecting');
        if (isBotMatch) {
            dot.title = "Đấu với Bot (Local Mic Test)";
        } else {
            dot.title = "Voice P2P 1-1: Chưa kết nối";
        }
    }
}

async function drainPendingIceCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) return;
    if (pendingIceCandidates.length === 0) return;

    console.log(`[Voice] Draining ${pendingIceCandidates.length} buffered ICE candidate(s)...`);
    while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("[Voice] Added buffered ICE candidate successfully.");
        } catch (err) {
            console.warn("[Voice] Failed to add buffered ICE candidate:", err);
        }
    }
}

// Routes incoming remote audio stream to BOTH HTMLMediaElement AND Web Audio API
// This guarantees audio plays through the Phone's Loudspeaker (loa ngoài) rather than the quiet earpiece!
function playIncomingStream(stream, track) {
    const remoteAudio = document.getElementById('remoteVoiceAudio');
    if (remoteAudio) {
        remoteAudio.srcObject = stream;
        remoteAudio.muted = isAudioDeafened;
        remoteAudio.volume = 1.0;
        remoteAudio.playsInline = true;

        const playPromise = remoteAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("[Voice] remoteAudio.play() rejected (will unlock on touch):", error);
            });
        }
    }

    // Force Loudspeaker playback on mobile devices using Web Audio API
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            if (!remoteAudioContext) {
                remoteAudioContext = new AudioCtx();
            }
            if (remoteAudioContext.state === 'suspended') {
                remoteAudioContext.resume().catch(() => {});
            }
            if (remoteAudioSource) {
                try { remoteAudioSource.disconnect(); } catch (e) {}
            }
            remoteAudioSource = remoteAudioContext.createMediaStreamSource(stream);
            if (!remoteGainNode) {
                remoteGainNode = remoteAudioContext.createGain();
            }
            remoteGainNode.gain.value = isAudioDeafened ? 0 : 1.0;
            remoteAudioSource.connect(remoteGainNode);
            remoteGainNode.connect(remoteAudioContext.destination);
            console.log("[Voice] Remote stream successfully connected to Web Audio destination (Loudspeaker).");
        }
    } catch (e) {
        console.warn("[Voice] Web Audio API playback routing error:", e);
    }

    if (track) {
        track.onunmute = () => {
            console.log("[Voice] Remote track unmuted, RTP voice packets arriving!");
            if (remoteAudioContext && remoteAudioContext.state === 'suspended') {
                remoteAudioContext.resume().catch(() => {});
            }
            if (remoteAudio && remoteAudio.paused) {
                remoteAudio.play().catch(() => {});
            }
        };
    }
}

export async function onMatchFoundVoice(matchData) {
    isBotMatch = !!matchData.isBot;

    // In Bot matches, mic is strictly in Local Mic Test mode (VU meter works, no WebRTC overhead)
    if (isBotMatch) {
        console.log("[Voice] Match is VS BOT. Local Mic Test active, WebRTC peer connection disabled.");
        closePeerConnection();
        updateVoiceConnectionUi('bot');
        return;
    }

    console.log("[Voice] PVP Match found! Initiating WebRTC connection, isInitiator:", matchData.isInitiator);

    // Setup WebRTC connection (tracks will be sent if mic is enabled)
    setupPeerConnection(matchData.isInitiator);
}

function setupPeerConnection(isInitiator) {
    closePeerConnection();
    pendingIceCandidates = [];
    hasNotifiedConnected = false;
    updateVoiceConnectionUi('connecting');

    try {
        peerConnection = new RTCPeerConnection(RTC_CONFIG);

        // Pre-attach track (real mic if active, or silent track) so WebRTC ALWAYS negotiates bidirectional sendrecv SDP
        const audioInfo = getOrCreateAudioTrackToAttach();
        if (audioInfo) {
            peerConnection.addTrack(audioInfo.track, audioInfo.stream);
            console.log("[Voice] Pre-attached audio track to RTCPeerConnection to guarantee bidirectional sendrecv SDP.");
        } else {
            try {
                peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
            } catch (e) {
                console.warn("[Voice] addTransceiver fallback:", e);
            }
        }

        // Receive remote opponent's audio track
        peerConnection.ontrack = (event) => {
            console.log("[Voice] Received remote audio track from opponent:", event.track);
            const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
            playIncomingStream(stream, event.track);
        };

        // Send ICE candidate to opponent via socket signaling
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && STATE.roomId) {
                socket.emit('voice_signal', {
                    room: STATE.roomId,
                    signal: {
                        type: 'candidate',
                        candidate: event.candidate
                    }
                });
            }
        };

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection ? peerConnection.connectionState : 'closed';
            console.log("[Voice] PeerConnection State changed:", state);
            updateVoiceConnectionUi(state);
        };

        peerConnection.oniceconnectionstatechange = () => {
            const iceState = peerConnection ? peerConnection.iceConnectionState : 'closed';
            console.log("[Voice] ICE Connection State changed:", iceState);
            if (iceState === 'disconnected' || iceState === 'failed') {
                updateVoiceConnectionUi(iceState);
            }
        };

        // If this player is the designated initiator (Player 1), create offer
        if (isInitiator) {
            peerConnection.createOffer({ offerToReceiveAudio: true })
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.emit('voice_signal', {
                        room: STATE.roomId,
                        signal: {
                            type: 'offer',
                            sdp: peerConnection.localDescription
                        }
                    });
                })
                .catch(err => console.error("[Voice] Create offer error:", err));
        }
    } catch (err) {
        console.error("[Voice] Error setting up RTCPeerConnection:", err);
        updateVoiceConnectionUi('failed');
    }
}

// ==========================================
// HANDLE INCOMING WEBRTC SIGNALS
// ==========================================
async function handleIncomingVoiceSignal(data) {
    const signal = data.signal;
    if (!signal) return;

    try {
        if (signal.type === 'offer') {
            console.log("[Voice] Received WebRTC offer from opponent.");
            if (!peerConnection) {
                setupPeerConnection(false);
            }

            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await drainPendingIceCandidates();

            // Ensure local mic tracks are attached if active
            if (localStream) {
                attachLocalTracksToPeer();
            }

            // Ensure all audio transceivers are set to sendrecv before creating answer
            if (peerConnection.getTransceivers) {
                peerConnection.getTransceivers().forEach(t => {
                    t.direction = 'sendrecv';
                });
            }

            const answer = await peerConnection.createAnswer({ offerToReceiveAudio: true });
            await peerConnection.setLocalDescription(answer);

            socket.emit('voice_signal', {
                room: STATE.roomId,
                signal: {
                    type: 'answer',
                    sdp: peerConnection.localDescription
                }
            });
        }
        else if (signal.type === 'answer') {
            console.log("[Voice] Received WebRTC answer from opponent.");
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                await drainPendingIceCandidates();
            }
        }
        else if (signal.type === 'candidate') {
            if (signal.candidate) {
                if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                    } catch (err) {
                        console.warn("[Voice] Error adding ICE candidate:", err);
                    }
                } else {
                    console.log("[Voice] Buffering incoming ICE candidate (remoteDescription not ready yet)");
                    pendingIceCandidates.push(signal.candidate);
                }
            }
        }
    } catch (err) {
        console.error("[Voice] Error handling voice signal:", err);
    }
}

// ==========================================
// CLEANUP
// ==========================================
export function closePeerConnection() {
    pendingIceCandidates = [];
    hasNotifiedConnected = false;

    if (peerConnection) {
        try {
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.onconnectionstatechange = null;
            peerConnection.oniceconnectionstatechange = null;
            peerConnection.close();
        } catch (e) {
            console.warn("[Voice] Error closing peerConnection:", e);
        }
        peerConnection = null;
    }

    if (remoteAudioSource) {
        try { remoteAudioSource.disconnect(); } catch (e) {}
        remoteAudioSource = null;
    }

    const remoteAudio = document.getElementById('remoteVoiceAudio');
    if (remoteAudio) {
        remoteAudio.srcObject = null;
    }

    updateVoiceConnectionUi('closed');
}
