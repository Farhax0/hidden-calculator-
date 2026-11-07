plugins {
    id("com.android.application")
}

android {
    namespace = "com.hiddencalc.vault"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hiddencalc.vault"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        // A fixed key kept in the repo so every build (local or CI) can install over the previous one
        // WITHOUT uninstalling (uninstalling would erase the vault). Replace with your own private key if
        // you publish the app.
        create("shared") {
            storeFile = file("signing.keystore")
            storePassword = "hiddencalc"
            keyAlias = "hiddencalc"
            keyPassword = "hiddencalc"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("shared")
        }
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webapp"))
}

// The calculator + vault UI is the same web app that lives in the repository root.
val copyWebApp by tasks.registering(Sync::class) {
    from(rootProject.projectDir.parentFile) {
        include("index.html", "style.css", "js/**", "icons/**")
    }
    into(layout.buildDirectory.dir("generated/webapp/www"))
}
tasks.named("preBuild") { dependsOn(copyWebApp) }

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
