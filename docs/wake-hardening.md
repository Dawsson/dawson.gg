# Wake-call hardening

`dawson.gg` keeps wake calls fixed to `HERMES_TO_NUMBER`. Hermes may create a bounded wake task at
`POST /api/internal/wake-tasks` using `HERMES_INTERNAL_TOKEN`; the route adapts the task to the
general voice-briefing system rather than maintaining a second legacy task database.

## Call cost and voicemail controls

Every outbound Call Control dial now sets:

- `timeout_secs: 20` — stop ringing after 20 seconds.
- `time_limit_secs` — enforce the task/session duration; wake tasks accept 30–180 seconds and
  default to 45 seconds.
- `answering_machine_detection: "detect"` — request standard AMD.

The webhook does not start the AI assistant on `call.answered`. It waits for
`call.machine.detection.ended`:

- `human` or `not_sure`: start the assistant. Telnyx recommends treating `not_sure` as human.
- `machine` or any other terminal non-human result: issue an idempotent Call Control hangup and do
  not start the assistant.

AMD is probabilistic, so this cannot guarantee that a voicemail is never reached. It does prevent
detected machines from starting billable assistant conversation time, and the dial-level time limit
bounds the remaining failure case.

No Telnyx dashboard change is required for this Call Control path. The application sends AMD and
duration controls per call. Keep the Voice API Application webhook set to
`https://dawson.gg/api/telnyx/webhook`.

If outbound calls are later moved to the Telnyx TeXML AI Calls endpoint, configure the assistant in
**AI Suite → AI Assistants → Hermes Voice → Telephony → Voicemail detection**, then send
`MachineDetection: Enable`, `AsyncAmd: true`, and `DetectionMode: Premium` on each AI call.

For a lower-cost fixed-message mode, use Call Control `playback_start` with a short WAV/MP3 after
the human AMD result, then hang up on `call.playback.ended`. This avoids AI-assistant minutes but
cannot hold a conversation or confirm wakefulness. It should be a separate explicit mode, not a
silent fallback that changes the wake contract.

## iPhone-only worst-case fallback

The Mac has `/usr/bin/shortcuts`, but it currently has no shortcut named `Wake Dawson iPhone`.
Find My supports **Play Sound** in its Mac UI, but Find My has no supported Shortcuts action,
AppleScript dictionary, or command-line API. Its private URL schemes do not document a safe
device-select-and-ring command.

Siri can respond interactively to requests such as “ring my iPhone,” but macOS exposes no supported
CLI or AppleScript command for submitting a Siri utterance. `osascript` can only activate Siri or
drive accessibility UI; that requires an unlocked GUI session, is timing-dependent, and can target
the wrong device. Automating Siri, Find My, or iCloud.com this way is therefore not used.

The safest Apple-native bridge is a synced Focus:

1. On iPhone, create a Focus named **Wake Alarm** and enable **Share Across Devices**.
2. In iPhone Shortcuts, create a personal automation:
   - Trigger: **When Turning On → Wake Alarm**
   - Actions: **Set Volume** to 100%, **Vibrate Device** several times, optionally **Set
     Flashlight** on, and **Play Music** or another locally available audio action.
   - Turn off **Ask Before Running** / select **Run Immediately**.
   - Add a final bounded cleanup: wait a short fixed interval, stop playback if available, turn the
     flashlight off, and turn the **Wake Alarm** Focus off.
3. On the Mac, create a shortcut named **Wake Dawson iPhone** with one action:
   **Set Focus → Wake Alarm → On** for a bounded duration.
4. Run that Mac shortcut manually once while awake to grant permissions and verify the iPhone—not
   the Mac—responds.
5. Only after that verification may Hermes invoke it over SSH:

   ```bash
   shortcuts run "Wake Dawson iPhone"
   ```

Until those user-created pieces are present and tested, no automated post-7:30 fallback should run.
For tonight, the 6:45 escalation remains phone-only.
