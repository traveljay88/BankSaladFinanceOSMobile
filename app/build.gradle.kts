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
        versionCode = 9
        versionName = "0.5.3"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.10.5")
    implementation("net.lingala.zip4j:zip4j:2.11.6")
}
