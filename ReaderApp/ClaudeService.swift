import Foundation
import UIKit

class ClaudeService {
    static let shared = ClaudeService()

    private let apiURL = URL(string: "https://api.anthropic.com/v1/messages")!

    func extractParagraphs(from image: UIImage) async throws -> [Paragraph] {
        let resized = image.resized(toMaxDimension: 1568)
        guard let imageData = resized.jpegData(compressionQuality: 0.85) else {
            throw ClaudeError.imageConversionFailed
        }
        let base64 = imageData.base64EncodedString()

        let prompt = """
        זוהי תמונה של לוח או דף עם טקסט בעברית (כתב יד או דפוס).
        זהה את כל הפסקאות/הבלוקים של הטקסט בתמונה.
        החזר JSON בלבד, ללא הסברים, בפורמט הזה:
        {
          "paragraphs": [
            {"index": 1, "text": "טקסט הפסקה הראשונה"},
            {"index": 2, "text": "טקסט הפסקה השנייה"}
          ]
        }
        חוקים:
        - סדר מלמעלה למטה ומימין לשמאל
        - כלול את כל הטקסט כולל כתב יד
        - אם יש רק פסקה אחת, החזר מערך עם איבר אחד
        - אל תוסיף שום טקסט מחוץ ל-JSON
        """

        let body: [String: Any] = [
            "model": "claude-opus-4-7",
            "max_tokens": 4096,
            "messages": [
                [
                    "role": "user",
                    "content": [
                        [
                            "type": "image",
                            "source": [
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": base64
                            ]
                        ],
                        [
                            "type": "text",
                            "text": prompt
                        ]
                    ]
                ]
            ]
        ]

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Config.anthropicAPIKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let msg = String(data: data, encoding: .utf8) ?? "unknown error"
            throw ClaudeError.apiError(msg)
        }

        let claudeResponse = try JSONDecoder().decode(ClaudeResponse.self, from: data)
        let text = claudeResponse.content.first?.text ?? ""

        guard let jsonStart = text.firstIndex(of: "{"),
              let jsonEnd = text.lastIndex(of: "}") else {
            throw ClaudeError.parseError
        }

        let jsonString = String(text[jsonStart...jsonEnd])
        let parsed = try JSONDecoder().decode(ParagraphsResponse.self, from: Data(jsonString.utf8))

        return parsed.paragraphs.map { Paragraph(id: $0.index, text: $0.text) }
    }
}

// MARK: - Errors

enum ClaudeError: LocalizedError {
    case imageConversionFailed
    case parseError
    case apiError(String)

    var errorDescription: String? {
        switch self {
        case .imageConversionFailed: return "לא ניתן לעבד את התמונה"
        case .parseError: return "שגיאה בניתוח התשובה"
        case .apiError(let msg): return "שגיאת API: \(msg)"
        }
    }
}

// MARK: - Response models

private struct ClaudeResponse: Codable {
    let content: [ContentBlock]
}

private struct ContentBlock: Codable {
    let text: String
}

private struct ParagraphsResponse: Codable {
    let paragraphs: [ParagraphData]
}

private struct ParagraphData: Codable {
    let index: Int
    let text: String
}

// MARK: - UIImage resize

extension UIImage {
    func resized(toMaxDimension maxDim: CGFloat) -> UIImage {
        let scale = min(maxDim / size.width, maxDim / size.height, 1.0)
        if scale >= 1.0 { return self }
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}
