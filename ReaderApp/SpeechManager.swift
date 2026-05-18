import AVFoundation
import Combine

class SpeechManager: NSObject, ObservableObject {
    private let synthesizer = AVSpeechSynthesizer()

    @Published var currentWordRange: NSRange?
    @Published var isSpeaking = false
    @Published var currentText: String = ""

    override init() {
        super.init()
        synthesizer.delegate = self

        // Позволяет звучать даже когда телефон на беззвучном режиме
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func speak(_ text: String) {
        synthesizer.stopSpeaking(at: .immediate)
        currentText = text
        currentWordRange = nil

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "he-IL")
        utterance.rate = 0.42          // чуть медленнее нормы — удобнее для восприятия
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
        currentWordRange = nil
        currentText = ""
    }

    func pauseOrResume() {
        if synthesizer.isSpeaking && !synthesizer.isPaused {
            synthesizer.pauseSpeaking(at: .word)
        } else if synthesizer.isPaused {
            synthesizer.continueSpeaking()
        }
    }
}

extension SpeechManager: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           willSpeakRangeOfSpeechString characterRange: NSRange,
                           utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.currentWordRange = characterRange
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = false
            self.currentWordRange = nil
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = false
            self.currentWordRange = nil
        }
    }
}
