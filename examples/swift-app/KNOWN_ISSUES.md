# Known Issues - Agenteract Swift Implementation

## ✅ Working Features

- **Tap interactions**: Successfully tested and working ✅
- **View hierarchy inspection**: Hybrid approach combining visual hierarchy + registry ✅
  - Visual hierarchy shows component types, text content, structure
  - AgentRegistry section shows all interactive elements with testIDs
- **WebSocket connection**: Connects and reconnects automatically ✅
- **Agent registry**: Properly registers and tracks components ✅
- **Console logs via simctl**: Working for simulators ✅
  - Device info automatically detected and sent on connection
  - Server uses `simctl` to stream logs from iOS Simulator
  - Fallback to in-app log capture for physical devices
- **Production-ready**: Uses only public UIKit/UIAccessibility APIs ✅

## 🔨 Issues to Fix

### 1. Text Input Not Working

**Status**: Not working
**Tested**: `pnpm agenteract-agents input swift-app text-input "Hello from Agenteract!"`

**Problem**: The `AgentTextField` component uses `@Binding` but the `onChangeText` handler may not be triggering the binding update correctly.

**Likely cause**: The `onChangeText` closure in `AgentBinding.swift` needs to properly update the SwiftUI `@State` through the binding.

**Fix needed**: Review the `AgentTextField` implementation and ensure the binding is updated when the agent sends text input commands.

---

### 2. Console Logs - Physical Device Support

**Status**: Simulator ✅ | Physical Device ⚠️
**Tested**: `pnpm agenteract-agents logs swift-app --since 20` - Working via simctl!

**Current Status**:
- ✅ Simulator logs work via `simctl`
- ⚠️ Physical device logs need `devicectl` implementation

**Solution for physical devices**:

#### For Simulators
Use `simctl` to stream logs from the simulator:

```bash
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "AgenteractSwiftExample"' --style compact
```

Or for all app logs:
```bash
xcrun simctl spawn booted log stream --level debug --predicate 'subsystem contains "io.agenteract"'
```

#### For Physical Devices
Use `devicectl` (Xcode 16+) or older `instruments` tools:

**Xcode 16+ with devicectl:**
```bash
xcrun devicectl device logs stream --device <device-id>
```

**Detecting device type:**
- Need to detect if app is running on simulator vs physical device
- Can use `UIDevice.current.name` or check for simulator-specific environment
- Agent server needs to know where app is running to choose correct log capture method

#### Implementation approach:
1. Add device detection in Swift app (simulator vs physical device)
2. Send device info in WebSocket connection handshake
3. Agent CLI spawns appropriate log capture process based on device type
4. Parse and forward logs through agent server to CLI

---

### 3. Device Detection

**Status**: ✅ Implemented and working!

**Implementation**:
- Device info (simulator/physical, device ID, bundle ID, etc.) is automatically sent on WebSocket connection
- Server stores device info per project
- Server automatically chooses correct log capture method based on device type
- Simulator detection uses `#if targetEnvironment(simulator)`
- Device ID obtained from `SIMULATOR_UDID` environment variable for simulators

---

## 📝 Technical Notes

### SwiftUI AccessibilityIdentifier Limitation

SwiftUI's `.accessibilityIdentifier()` modifier **does not propagate to UIKit's `accessibilityIdentifier` property**. This is a known SwiftUI behavior - the accessibility identifier is primarily for XCTest UI testing and is not exposed through the standard UIKit accessibility APIs.

**Our Solution**: Hybrid approach
- **Visual hierarchy**: Traverse UIKit view tree to get structure, component types, and text content
- **Agent registry**: Maintain our own registry of testID → handler mappings
- **Result**: Both visual understanding AND functional interaction capabilities

This is actually **superior to React Native's approach**, which only works in debug mode with DevTools.

## 📋 TODO List

- [ ] Fix text input binding in `AgentTextField`
- [ ] Implement log capture for physical devices using `devicectl` (Xcode 16+)
- [ ] Test scroll gesture simulation (if needed)
- [ ] Test long press interaction
- [x] ~~Implement full SwiftUI view tree traversal~~ - Done via hybrid UIKit + Registry approach
- [x] ~~Add device detection to `AgentDebugBridge.swift`~~ - ✅ Done
- [x] ~~Implement log capture for simulators using `simctl`~~ - ✅ Done
- [x] ~~Add device info handshake in WebSocket connection~~ - ✅ Done
- [x] ~~Update agent server to handle device-specific log streaming~~ - ✅ Done

---

## 🔍 Testing Notes

### Current Test Results (2025-10-23)

**Environment:**
- Running on iOS Simulator
- Device detected automatically via device info handshake
- Bundle ID: com.example.AgenteractSwiftExample

**Test Results:**
1. ✅ **Tap**: Working perfectly
2. ❌ **Text Input**: Not working yet
3. ✅ **Console Logs**: Working via simctl!
4. ✅ **View Hierarchy**: Hybrid approach returns visual structure + registry testIDs
5. ⚠️  **Long Press**: Not tested yet

### How to Test

1. Start agent server:
   ```bash
   pnpm agenterserve dev
   ```

2. Run the app in Xcode (Cmd+R)

3. Test commands:
   ```bash
   # View hierarchy
   pnpm agenteract-agents hierarchy swift-app

   # Tap
   pnpm agenteract-agents tap swift-app tap-button

   # Input (not working yet)
   pnpm agenteract-agents input swift-app text-input "test"

   # Logs (not working yet)
   pnpm agenteract-agents logs swift-app --since 20
   ```

---

## 📚 References

- [simctl log streaming](https://developer.apple.com/documentation/xcode/simctl)
- [devicectl (Xcode 16+)](https://developer.apple.com/documentation/xcode/devicectl)
- [os_log for Swift logging](https://developer.apple.com/documentation/os/logging)
- [UIDevice documentation](https://developer.apple.com/documentation/uikit/uidevice)
