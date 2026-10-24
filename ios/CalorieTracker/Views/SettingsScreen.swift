import CalorieCore
import SwiftUI

struct SettingsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var apiKey = ""
    @State private var testResult: Bool?
    @State private var testing = false
    @State private var calorieGoal = ""
    @State private var proteinGoal = ""
    @State private var carbsGoal = ""
    @State private var fatGoal = ""
    @State private var loaded = false

    private var goals: Goals? {
        let values = [calorieGoal, proteinGoal, carbsGoal, fatGoal].map { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard let c = values[0], let p = values[1], let k = values[2], let f = values[3], c > 0, p > 0, k > 0, f > 0 else { return nil }
        return Goals(calorieGoal: c, proteinGoalG: p, carbsGoalG: k, fatGoalG: f)
    }

    var body: some View {
        Form {
            serverSection
            apiKeySection
            goalsSection
            syncSection
            aboutSection
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
        }
        .onAppear(perform: load)
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        address = model.serverAddress
        let g = model.state.currentGoals
        calorieGoal = String(g.calorieGoal)
        proteinGoal = String(g.proteinGoalG)
        carbsGoal = String(g.carbsGoalG)
        fatGoal = String(g.fatGoalG)
    }

    private var serverSection: some View {
        Section {
            TextField("https://host.tailnet.ts.net", text: $address)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .onSubmit(saveServer)
            HStack {
                Button("Save", action: saveServer)
                    .disabled(address == model.serverAddress)
                Spacer()
                Button {
                    Task {
                        testing = true
                        testResult = await model.testConnection(address)
                        testing = false
                    }
                } label: {
                    if testing { ProgressView() } else { Text("Test") }
                }
                .buttonStyle(.borderless)
                .disabled(address.isEmpty || testing)
            }
            if let testResult {
                Label(
                    testResult ? "The server answered." : "No answer. Is Tailscale on, and the server running?",
                    systemImage: testResult ? "checkmark.circle" : "xmark.circle"
                )
                .foregroundStyle(testResult ? Color.green : Color.red)
                .font(.footnote)
            }
        } header: {
            Text("Home server")
        } footer: {
            Text("The address from `tailscale serve status` on the server. The phone uploads what you log whenever this answers, and keeps it until then, so Tailscale only needs to be on now and then.")
        }
    }

    private func saveServer() {
        if model.saveServer(address) {
            address = model.serverAddress
            testResult = nil
        } else {
            model.show("That isn't a web address", isError: true)
        }
    }

    private var apiKeySection: some View {
        Section {
            if model.hasAPIKey {
                LabeledContent("API key", value: "Saved in the Keychain")
                Button("Remove key", role: .destructive) { model.removeAPIKey() }
            } else {
                SecureField("sk-ant-…", text: $apiKey)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Save key") {
                    model.saveAPIKey(apiKey)
                    apiKey = ""
                }
                .disabled(apiKey.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        } header: {
            Text("Claude")
        } footer: {
            Text("Lets the phone estimate meals itself, away from home. The server's key works, but a separate key from the Claude Console (named \"iPhone\", say) can be revoked on its own. Without one, meals are saved as text and the server estimates them when the phone syncs.")
        }
    }

    private var goalsSection: some View {
        Section {
            goalField("Calories", unit: "kcal", text: $calorieGoal)
            goalField("Protein", unit: "g", text: $proteinGoal)
            goalField("Carbs", unit: "g", text: $carbsGoal)
            goalField("Fat", unit: "g", text: $fatGoal)
            Button("Save goals") {
                guard let goals else { return }
                model.saveGoals(goals)
                model.show("Goals saved")
            }
            .disabled(goals == nil || goals == model.state.currentGoals)
        } header: {
            Text("Daily goals")
        } footer: {
            if goals == nil { Text("Enter a whole number greater than 0 for each goal.").foregroundStyle(.red) }
        }
    }

    private func goalField(_ label: String, unit: String, text: Binding<String>) -> some View {
        LabeledContent(label) {
            HStack {
                TextField(label, text: text).keyboardType(.numberPad).multilineTextAlignment(.trailing)
                Text(unit).foregroundStyle(.secondary)
            }
        }
    }

    private var syncSection: some View {
        Section {
            LabeledContent("Status", value: statusText)
            if let last = model.state.lastSyncAt {
                LabeledContent("Last synced") { Text(last, format: .relative(presentation: .named)) }
            }
            LabeledContent("Waiting to upload", value: String(model.state.pendingCount))
            Button("Sync now") { Task { await model.syncNow() } }
                .disabled(model.phase == .notConfigured || model.phase == .syncing)
            ForEach(model.state.failedRecords) { record in
                VStack(alignment: .leading, spacing: 4) {
                    Text(record.summary).lineLimit(2)
                    Text(record.failure ?? "").font(.caption).foregroundStyle(.red)
                    HStack {
                        Button("Retry") { model.retry(record.id) }
                        Spacer()
                        Button("Discard", role: .destructive) { model.discard(record.id) }
                    }
                    .buttonStyle(.borderless)
                    .font(.subheadline)
                }
            }
        } header: {
            Text("Sync")
        } footer: {
            Text("The phone checks the server when the app opens, when the network changes, and every 30 seconds while something is waiting. iOS may also let it sync in the background now and then.")
        }
    }

    private var statusText: String {
        switch model.phase {
        case .notConfigured: return "No server set up"
        case .idle: return "Not checked yet"
        case .syncing: return "Syncing…"
        case .offline: return "Server not reachable"
        case .synced: return "Up to date"
        case let .error(message): return message
        }
    }

    private var aboutSection: some View {
        Section("About") {
            LabeledContent("Model on this phone", value: ClaudeEstimator.model)
            if let settings = model.state.settings {
                LabeledContent("Model on the server", value: settings.model)
                LabeledContent("Database", value: settings.databasePath)
                LabeledContent("Tokens (all saved entries)") {
                    Text("\(settings.tokenUsage.inputTokens.formatted()) in · \(settings.tokenUsage.outputTokens.formatted()) out")
                }
            }
        }
    }
}
