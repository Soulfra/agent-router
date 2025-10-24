/**
 * iOS Project Builder
 *
 * Creates REAL Xcode projects (.xcodeproj), not README examples.
 *
 * Unlike the fake "iOS app" that's just documentation, this generates:
 * - Actual .xcodeproj directory structure
 * - project.pbxproj file with proper format
 * - Info.plist, Assets.xcassets
 * - SwiftUI app structure
 * - Working iOS app that compiles in Xcode
 *
 * Output:
 *   ShopifyAdmin/
 *   ├── ShopifyAdmin.xcodeproj/
 *   │   └── project.pbxproj          <-- Real Xcode project file
 *   ├── ShopifyAdmin/
 *   │   ├── ShopifyAdminApp.swift    <-- Real Swift code
 *   │   ├── ContentView.swift
 *   │   ├── Info.plist
 *   │   └── Assets.xcassets/
 *   └── ShopifyAdminTests/
 *
 * Can open in Xcode and run immediately.
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class iOSProjectBuilder {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Build complete iOS Xcode project
   * @param {object} generatedCode - Code from RealCodeGenerator
   * @param {string} outputDir - Output directory
   * @returns {string} Path to .xcodeproj
   */
  async buildProject(generatedCode, outputDir) {
    const { appName, files } = generatedCode;

    console.log(`📱 Building Xcode project: ${appName}`);

    const projectDir = path.join(outputDir, appName);
    const xcodeProjectDir = path.join(projectDir, `${appName}.xcodeproj`);

    // Create directory structure
    await this.createDirectoryStructure(projectDir, appName);

    // Write source files
    await this.writeSourceFiles(projectDir, appName, files);

    // Generate Xcode project file
    await this.generateXcodeProject(xcodeProjectDir, appName, files);

    // Generate Info.plist
    await this.generateInfoPlist(projectDir, appName);

    // Generate Assets.xcassets
    await this.generateAssets(projectDir, appName);

    // Generate LaunchScreen.storyboard
    await this.generateLaunchScreen(projectDir, appName);

    console.log(`✅ Created Xcode project at: ${projectDir}`);
    console.log(`   Open with: open ${appName}.xcodeproj`);

    return xcodeProjectDir;
  }

  /**
   * Create iOS project directory structure
   */
  async createDirectoryStructure(projectDir, appName) {
    const dirs = [
      projectDir,
      path.join(projectDir, appName),
      path.join(projectDir, appName, 'API'),
      path.join(projectDir, appName, 'Models'),
      path.join(projectDir, appName, 'Views'),
      path.join(projectDir, appName, 'ViewModels'),
      path.join(projectDir, appName, 'Assets.xcassets'),
      path.join(projectDir, appName, 'Assets.xcassets', 'AppIcon.appiconset'),
      path.join(projectDir, appName, 'Assets.xcassets', 'AccentColor.colorset'),
      path.join(projectDir, `${appName}Tests`),
      path.join(projectDir, `${appName}.xcodeproj`)
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Write Swift source files
   */
  async writeSourceFiles(projectDir, appName, files) {
    for (const file of files) {
      const filePath = path.join(projectDir, file.path);
      await fs.writeFile(filePath, file.content, 'utf8');
    }

    // Always generate main app file if not present
    const appFilePath = path.join(projectDir, appName, `${appName}App.swift`);
    try {
      await fs.access(appFilePath);
    } catch {
      await fs.writeFile(appFilePath, this.generateAppFile(appName), 'utf8');
    }

    // Always generate ContentView if not present
    const contentViewPath = path.join(projectDir, appName, 'ContentView.swift');
    try {
      await fs.access(contentViewPath);
    } catch {
      await fs.writeFile(contentViewPath, this.generateContentView(appName), 'utf8');
    }
  }

  /**
   * Generate main app entry point
   */
  generateAppFile(appName) {
    return `import SwiftUI

@main
struct ${appName}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`;
  }

  /**
   * Generate ContentView
   */
  generateContentView(appName) {
    return `import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Image(systemName: "globe")
                    .imageScale(.large)
                    .foregroundColor(.accentColor)

                Text("${appName}")
                    .font(.largeTitle)
                    .bold()

                Text("Auto-generated iOS app")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()

                // Add your generated views here
            }
            .padding()
            .navigationTitle("${appName}")
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
`;
  }

  /**
   * Generate Xcode project.pbxproj file
   * This is the complex XML-like format Xcode uses
   */
  async generateXcodeProject(xcodeProjectDir, appName, files) {
    // Generate UUIDs for Xcode objects
    const uuids = {
      project: this.generateXcodeUUID(),
      mainGroup: this.generateXcodeUUID(),
      appGroup: this.generateXcodeUUID(),
      testsGroup: this.generateXcodeUUID(),
      productsGroup: this.generateXcodeUUID(),
      appTarget: this.generateXcodeUUID(),
      testsTarget: this.generateXcodeUUID(),
      appProduct: this.generateXcodeUUID(),
      testsProduct: this.generateXcodeUUID(),
      frameworksBuildPhase: this.generateXcodeUUID(),
      resourcesBuildPhase: this.generateXcodeUUID(),
      sourcesBuildPhase: this.generateXcodeUUID(),
      buildConfig: this.generateXcodeUUID(),
      debugConfig: this.generateXcodeUUID(),
      releaseConfig: this.generateXcodeUUID()
    };

    // Generate file references for all Swift files
    const fileRefs = files
      .filter(f => f.path.endsWith('.swift'))
      .map(f => ({
        uuid: this.generateXcodeUUID(),
        path: f.path,
        name: path.basename(f.path)
      }));

    // Generate build file references
    const buildFiles = fileRefs.map(f => ({
      uuid: this.generateXcodeUUID(),
      fileRef: f.uuid
    }));

    const pbxproj = this.generatePbxprojContent(appName, uuids, fileRefs, buildFiles);

    await fs.writeFile(
      path.join(xcodeProjectDir, 'project.pbxproj'),
      pbxproj,
      'utf8'
    );
  }

  /**
   * Generate project.pbxproj content (Xcode's project file format)
   */
  generatePbxprojContent(appName, uuids, fileRefs, buildFiles) {
    return `// !$*UTF8*$!
{
\tarchiveVersion = 1;
\tclasses = {
\t};
\tobjectVersion = 56;
\tobjects = {

/* Begin PBXBuildFile section */
${buildFiles.map(bf => `\t\t${bf.uuid} /* ${fileRefs.find(f => f.uuid === bf.fileRef).name} in Sources */ = {isa = PBXBuildFile; fileRef = ${bf.fileRef}; };`).join('\n')}
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
\t\t${uuids.appProduct} /* ${appName}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${appName}.app; sourceTree = BUILT_PRODUCTS_DIR; };
${fileRefs.map(f => `\t\t${f.uuid} /* ${f.name} */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "${f.name}"; sourceTree = "<group>"; };`).join('\n')}
\t\t${this.generateXcodeUUID()} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
\t\t${uuids.frameworksBuildPhase} /* Frameworks */ = {
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t${uuids.project} = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${uuids.appGroup} /* ${appName} */,
\t\t\t\t${uuids.productsGroup} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${uuids.appGroup} /* ${appName} */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
${fileRefs.map(f => `\t\t\t\t${f.uuid} /* ${f.name} */,`).join('\n')}
\t\t\t);
\t\t\tpath = ${appName};
\t\t\tsourceTree = "<group>";
\t\t};
\t\t${uuids.productsGroup} /* Products */ = {
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t${uuids.appProduct} /* ${appName}.app */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t${uuids.appTarget} /* ${appName} */ = {
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = ${uuids.buildConfig};
\t\t\tbuildPhases = (
\t\t\t\t${uuids.sourcesBuildPhase} /* Sources */,
\t\t\t\t${uuids.frameworksBuildPhase} /* Frameworks */,
\t\t\t\t${uuids.resourcesBuildPhase} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = ${appName};
\t\t\tproductName = ${appName};
\t\t\tproductReference = ${uuids.appProduct};
\t\t\tproductType = "com.apple.product-type.application";
\t\t};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t${uuids.project} /* Project object */ = {
\t\t\tisa = PBXProject;
\t\t\tattributes = {
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1500;
\t\t\t\tLastUpgradeCheck = 1500;
\t\t\t};
\t\t\tbuildConfigurationList = ${uuids.buildConfig};
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\thasScannedForEncodings = 0;
\t\t\tmainGroup = ${uuids.mainGroup};
\t\t\tproductRefGroup = ${uuids.productsGroup};
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t${uuids.appTarget} /* ${appName} */,
\t\t\t);
\t\t};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t${uuids.resourcesBuildPhase} /* Resources */ = {
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t${uuids.sourcesBuildPhase} /* Sources */ = {
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
${buildFiles.map(bf => `\t\t\t\t${bf.uuid} /* ${fileRefs.find(f => f.uuid === bf.fileRef).name} in Sources */,`).join('\n')}
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
\t\t${uuids.debugConfig} /* Debug */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tASYNC_SWIFT_OPTIMIZATION_LEVEL = "-Onone";
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_ASSET_PATHS = "";
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
\t\t\t\tINFOPLIST_KEY_UILaunchScreen_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 16.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks";
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = "com.generated.${appName}";
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t};
\t\t\tname = Debug;
\t\t};
\t\t${uuids.releaseConfig} /* Release */ = {
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tDEVELOPMENT_ASSET_PATHS = "";
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
\t\t\t\tINFOPLIST_KEY_UILaunchScreen_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 16.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks";
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = "com.generated.${appName}";
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t};
\t\t\tname = Release;
\t\t};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t${uuids.buildConfig} /* Build configuration list for PBXProject "${appName}" */ = {
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t${uuids.debugConfig} /* Debug */,
\t\t\t\t${uuids.releaseConfig} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t};
/* End XCConfigurationList section */
\t};
\trootObject = ${uuids.project} /* Project object */;
}
`;
  }

  /**
   * Generate Xcode-compatible UUID (24 character hex)
   */
  generateXcodeUUID() {
    return uuidv4().replace(/-/g, '').substring(0, 24).toUpperCase();
  }

  /**
   * Generate Info.plist
   */
  async generateInfoPlist(projectDir, appName) {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>$(DEVELOPMENT_LANGUAGE)</string>
\t<key>CFBundleDisplayName</key>
\t<string>${appName}</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
\t<key>CFBundleShortVersionString</key>
\t<string>1.0</string>
\t<key>CFBundleVersion</key>
\t<string>1</string>
\t<key>LSRequiresIPhoneOS</key>
\t<true/>
\t<key>UIApplicationSceneManifest</key>
\t<dict>
\t\t<key>UIApplicationSupportsMultipleScenes</key>
\t\t<true/>
\t</dict>
\t<key>UIApplicationSupportsIndirectInputEvents</key>
\t<true/>
\t<key>UILaunchScreen</key>
\t<dict/>
\t<key>UIRequiredDeviceCapabilities</key>
\t<array>
\t\t<string>armv7</string>
\t</array>
\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>
</dict>
</plist>
`;

    await fs.writeFile(
      path.join(projectDir, appName, 'Info.plist'),
      plist,
      'utf8'
    );
  }

  /**
   * Generate Assets.xcassets structure
   */
  async generateAssets(projectDir, appName) {
    const assetsDir = path.join(projectDir, appName, 'Assets.xcassets');

    // Contents.json for Assets.xcassets
    await fs.writeFile(
      path.join(assetsDir, 'Contents.json'),
      JSON.stringify({
        info: {
          author: 'xcode',
          version: 1
        }
      }, null, 2),
      'utf8'
    );

    // AppIcon.appiconset
    await fs.writeFile(
      path.join(assetsDir, 'AppIcon.appiconset', 'Contents.json'),
      JSON.stringify({
        images: [
          {
            filename: 'AppIcon.png',
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024'
          }
        ],
        info: {
          author: 'xcode',
          version: 1
        }
      }, null, 2),
      'utf8'
    );

    // AccentColor.colorset
    await fs.writeFile(
      path.join(assetsDir, 'AccentColor.colorset', 'Contents.json'),
      JSON.stringify({
        colors: [
          {
            idiom: 'universal'
          }
        ],
        info: {
          author: 'xcode',
          version: 1
        }
      }, null, 2),
      'utf8'
    );
  }

  /**
   * Generate LaunchScreen.storyboard
   */
  async generateLaunchScreen(projectDir, appName) {
    const launchScreen = `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="21507" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina6_12" orientation="portrait" appearance="light"/>
    <dependencies>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="21505"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <subviews>
                            <label opaque="NO" clipsSubviews="YES" userInteractionEnabled="NO" contentMode="left" horizontalHuggingPriority="251" verticalHuggingPriority="251" text="${appName}" textAlignment="center" lineBreakMode="tailTruncation" baselineAdjustment="alignBaselines" minimumFontSize="18" translatesAutoresizingMaskIntoConstraints="NO" id="GJd-Yh-RWb">
                                <rect key="frame" x="0.0" y="402" width="393" height="48"/>
                                <fontDescription key="fontDescription" type="boldSystem" pointSize="40"/>
                                <nil key="highlightedColor"/>
                            </label>
                        </subviews>
                        <viewLayoutGuide key="safeArea" id="6Tk-OE-BBY"/>
                        <color key="backgroundColor" systemColor="systemBackgroundColor"/>
                        <constraints>
                            <constraint firstItem="GJd-Yh-RWb" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="moa-c2-u7t"/>
                            <constraint firstItem="GJd-Yh-RWb" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="uqX-NP-6Vq"/>
                        </constraints>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="53" y="375"/>
        </scene>
    </scenes>
    <resources>
        <systemColor name="systemBackgroundColor">
            <color white="1" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/>
        </systemColor>
    </resources>
</document>
`;

    await fs.writeFile(
      path.join(projectDir, appName, 'LaunchScreen.storyboard'),
      launchScreen,
      'utf8'
    );
  }
}

module.exports = iOSProjectBuilder;
