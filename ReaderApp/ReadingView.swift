import SwiftUI

struct ReadingView: View {
    let paragraph: Paragraph
    @ObservedObject var speechManager: SpeechManager
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Текст с подсветкой слова
            ScrollView {
                highlightedText
                    .font(.system(size: 34, weight: .medium, design: .rounded))
                    .lineSpacing(14)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .environment(\.layoutDirection, .rightToLeft)
                    .padding(24)
            }
            .frame(maxHeight: .infinity)

            Divider()

            // Кнопки управления
            HStack(spacing: 24) {
                // Пауза / продолжить
                Button(action: { speechManager.pauseOrResume() }) {
                    Image(systemName: speechManager.isSpeaking ? "pause.fill" : "play.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.blue)
                        .frame(width: 60, height: 60)
                        .background(Color.blue.opacity(0.12))
                        .clipShape(Circle())
                }

                // Стоп
                Button(action: onClose) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white)
                        .frame(width: 60, height: 60)
                        .background(Color.red)
                        .clipShape(Circle())
                }
            }
            .padding(.vertical, 24)
        }
        .background(Color(.systemBackground))
    }

    // Подсвечиваем текущее слово жёлтым
    private var highlightedText: Text {
        guard let range = speechManager.currentWordRange,
              let swiftRange = Range(range, in: paragraph.text) else {
            return Text(paragraph.text)
        }

        let before = paragraph.text[paragraph.text.startIndex..<swiftRange.lowerBound]
        let word   = paragraph.text[swiftRange]
        let after  = paragraph.text[swiftRange.upperBound..<paragraph.text.endIndex]

        return Text(before)
            + Text(word).foregroundColor(.black).background(Color.yellow)
            + Text(after)
    }
}
