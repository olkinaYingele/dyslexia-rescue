import SwiftUI

struct ContentView: View {
    @StateObject private var speechManager = SpeechManager()

    @State private var selectedImage: UIImage?
    @State private var paragraphs: [Paragraph] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var activeParagraph: Paragraph?

    @State private var showCamera = false
    @State private var showLibrary = false

    var body: some View {
        NavigationStack {
            Group {
                if let active = activeParagraph {
                    ReadingView(paragraph: active, speechManager: speechManager) {
                        speechManager.stop()
                        activeParagraph = nil
                    }
                } else {
                    mainScreen
                }
            }
            .navigationTitle("קורא")
            .navigationBarTitleDisplayMode(.large)
            .environment(\.layoutDirection, .rightToLeft)
        }
    }

    // MARK: - Main screen

    private var mainScreen: some View {
        VStack(spacing: 16) {
            photoButtons
                .padding(.horizontal)
                .padding(.top, 8)

            if let image = selectedImage {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 200)
                    .cornerRadius(14)
                    .padding(.horizontal)
            }

            if isLoading {
                loadingView
            } else if let error = errorMessage {
                Text(error)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding()
            } else if !paragraphs.isEmpty {
                paragraphList
            }

            Spacer()
        }
        .sheet(isPresented: $showCamera) {
            ImagePickerView(sourceType: .camera,
                            selectedImage: $selectedImage,
                            onImageSelected: analyzeImage)
        }
        .sheet(isPresented: $showLibrary) {
            ImagePickerView(sourceType: .photoLibrary,
                            selectedImage: $selectedImage,
                            onImageSelected: analyzeImage)
        }
    }

    // MARK: - Subviews

    private var photoButtons: some View {
        HStack(spacing: 12) {
            Button(action: { showCamera = true }) {
                Label("צלם", systemImage: "camera.fill")
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(14)
            }

            Button(action: { showLibrary = true }) {
                Label("גלריה", systemImage: "photo.fill")
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color(.secondarySystemBackground))
                    .foregroundColor(.primary)
                    .cornerRadius(14)
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.6)
            Text("מנתח את הטקסט...")
                .font(.title3)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }

    private var paragraphList: some View {
        VStack(alignment: .trailing, spacing: 8) {
            Text("בחר קטע לקריאה:")
                .font(.headline)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal)

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(paragraphs) { paragraph in
                        ParagraphRow(paragraph: paragraph,
                                     isActive: activeParagraph?.id == paragraph.id) {
                            activeParagraph = paragraph
                            speechManager.speak(paragraph.text)
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    // MARK: - Logic

    private func analyzeImage(_ image: UIImage) {
        isLoading = true
        errorMessage = nil
        paragraphs = []
        activeParagraph = nil
        speechManager.stop()

        Task {
            do {
                let result = try await ClaudeService.shared.extractParagraphs(from: image)
                await MainActor.run {
                    paragraphs = result
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - Paragraph row

struct ParagraphRow: View {
    let paragraph: Paragraph
    let isActive: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 12) {
                Text(paragraph.text)
                    .font(.body)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .environment(\.layoutDirection, .rightToLeft)
                    .foregroundColor(.primary)

                Text("\(paragraph.id)")
                    .font(.callout.bold())
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(isActive ? Color.orange : Color.blue)
                    .clipShape(Circle())
            }
            .padding(14)
            .background(isActive
                        ? Color.orange.opacity(0.12)
                        : Color(.secondarySystemBackground))
            .cornerRadius(14)
        }
        .buttonStyle(.plain)
    }
}
