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

    // Set initial UI state (Muted by default)
    updateMicUi(isMicMuted);

    // Listen for WebRTC signals from opponent
    socket.on('voice_signal', handleIncomingVoiceSignal);

    // Start passive animation loop for the VU meter
    startMeterLoop();
}

// ==========================================
// MICROPHONE ACCESS & AUDIO ANALYZER
// ==========================================
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
            analyserNode.fftSize = 256;
            analyserNode.smoothingTimeConstant = 0.5;

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
            const senders = peerConnection.getSenders();
            localStream.getAudioTracks().forEach(track => {
                if (!senders.some(s => s.track === track)) {
                    peerConnection.addTrack(track, localStream);
                }
            });
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
    const dataArray = new Uint8Array(128);

    function renderMeter() {
        if (!isMicMuted && analyserNode && localStream) {
            analyserNode.getByteFrequencyData(dataArray);

            // Compute energy in human vocal frequency range (~100Hz - 3500Hz)
            let sum = 0;
            const startBin = 2;
            const endBin = 40;
            for (let i = startBin; i < endBin; i++) {
                sum += dataArray[i];
            }
            const avgEnergy = sum / (endBin - startBin);

            // Noise gate threshold: ambient room noise (< 5) gives 0
            let targetHeight = 0;
            if (avgEnergy > 5) {
                // Non-linear power scale: whispering is ~20-35%, normal talk is ~50-70%, loud is ~85-100%
                targetHeight = Math.min(100, Math.pow((avgEnergy - 5) / 58, 1.25) * 100);
            }

            // Easing interpolation for snappy & rhythmic bounce
            currentMeterVolume += (targetHeight - currentMeterVolume) * 0.38;
        } else {
            // Smoothly drop to 0 when muted or no mic
            currentMeterVolume += (0 - currentMeterVolume) * 0.3;
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
        const senders = peerConnection.getSenders();
        localStream.getAudioTracks().forEach(track => {
            if (!senders.some(s => s.track === track)) {
                peerConnection.addTrack(track, localStream);
            }
        });
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
export async function onMatchFoundVoice(matchData) {
    isBotMatch = !!matchData.isBot;

    // In Bot matches, mic is strictly in Local Mic Test mode (VU meter works, no WebRTC overhead)
    if (isBotMatch) {
        console.log("[Voice] Match is VS BOT. Local Mic Test active.");
        return;
    }

    console.log("[Voice] PVP Match found! Initiating WebRTC connection, isInitiator:", matchData.isInitiator);

    // Setup WebRTC connection (tracks will be sent if mic is enabled)
    setupPeerConnection(matchData.isInitiator);
}

function setupPeerConnection(isInitiator) {
    closePeerConnection();

    try {
        peerConnection = new RTCPeerConnection(RTC_CONFIG);

        // Add local mic tracks to peer connection
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Receive remote opponent's audio track
        peerConnection.ontrack = (event) => {
            console.log("[Voice] Received remote audio track from opponent.");
            const remoteAudio = document.getElementById('remoteVoiceAudio');
            if (remoteAudio && event.streams && event.streams[0]) {
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.muted = isAudioDeafened;
                remoteAudio.play().catch(e => console.warn("[Voice] Remote audio play error:", e));
            }
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

        peerConnection.oniceconnectionstatechange = () => {
            console.log("[Voice] ICE Connection State:", peerConnection?.iceConnectionState);
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

            // Ensure local mic tracks are added
            if (localStream) {
                localStream.getAudioTracks().forEach(track => {
                    const senders = peerConnection.getSenders();
                    if (!senders.some(s => s.track === track)) {
                        peerConnection.addTrack(track, localStream);
                    }
                });
            }

            const answer = await peerConnection.createAnswer();
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
            }
        }
        else if (signal.type === 'candidate') {
            if (peerConnection && signal.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
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
    if (peerConnection) {
        try {
            peerConnection.ontrack = null;
            peerConnection.onicecandidate = null;
            peerConnection.close();
        } catch (e) {
            console.warn("[Voice] Error closing peerConnection:", e);
        }
        peerConnection = null;
    }

    const remoteAudio = document.getElementById('remoteVoiceAudio');
    if (remoteAudio) {
        remoteAudio.srcObject = null;
    }
}
