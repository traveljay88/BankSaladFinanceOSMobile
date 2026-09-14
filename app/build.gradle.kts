plugins {
    id("com.android.application")
}

android {
    namespace = "com.axiscw.financeos"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.axiscw.financeos"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "0.4.0"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("net.lingala.zip4j:zip4j:2.11.6")
}
