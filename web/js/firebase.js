// ============================================================
// MEDZONEX FIREBASE
// ============================================================

import {
    initializeApp,
    getApps,
    getApp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


const firebaseConfig = {

    apiKey:
        "AIzaSyBlu8NE_YftR8waBycLoXnpDcdxL9whECw",

    authDomain:
        "data-2c37b.firebaseapp.com",

    projectId:
        "data-2c37b",

    storageBucket:
        "data-2c37b.firebasestorage.app",

    messagingSenderId:
        "117351129570",

    appId:
        "1:117351129570:web:cc7e045aa33730f29d59bb",

    measurementId:
        "G-PMPDHJ6PJL"
};


// Prevent duplicate Firebase initialization
const app =
    getApps().length
        ? getApp()
        : initializeApp(firebaseConfig);


const auth =
    getAuth(app);


const db =
    getFirestore(app);


export {
    app,
    auth,
    db
};