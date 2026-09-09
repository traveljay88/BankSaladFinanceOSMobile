plugins {
    id("com.android.application")
}

android {
    namespace = "com.axiscw.financeos"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.axiscw.financeos"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("net.lingala.zip4j:zip4j:2.11.6")
}
