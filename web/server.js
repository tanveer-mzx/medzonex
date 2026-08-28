require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const cors = require("cors");
const OpenAI = require("openai");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");

const app = express();

/* =====================================================
   BASIC CONFIG
===================================================== */

const PORT = process.env.PORT || 3000;

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);


/* =====================================================
   CORS
===================================================== */

const allowedOrigins = new Set([
    "https://data-2c37b.web.app",
    "https://data-2c37b.firebaseapp.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]);


app.use(
    cors({
        origin: function (origin, callback) {

            if (
                !origin ||
                allowedOrigins.has(origin)
            ) {
                return callback(null, true);
            }

            /*
             * Firebase Hosting / Render / Railway /
             * other deployment domains can be added
             * through ALLOWED_ORIGINS in .env.
             */

            const extraOrigins =
                String(
                    process.env.ALLOWED_ORIGINS || ""
                )
                    .split(",")
                    .map(x => x.trim())
                    .filter(Boolean);


            if (
                extraOrigins.includes(origin)
            ) {
                return callback(null, true);
            }


            return callback(
                new Error(
                    "Origin not allowed by CORS."
                )
            );

        },

        credentials: true
    })
);


/* =====================================================
   STATIC WEBSITE
===================================================== */

app.use(
    express.static(__dirname)
);


/* =====================================================
   FIREBASE ADMIN
===================================================== */

let serviceAccount;

try {

    serviceAccount =
        require(
            "./serviceAccountKey.json"
        );

} catch (error) {

    console.error(
        "serviceAccountKey.json not found."
    );

    console.error(
        "Place serviceAccountKey.json inside the server project folder."
    );

    process.exit(1);

}


if (
    !admin.apps.length
) {

    admin.initializeApp({
        credential:
            admin.credential.cert(
                serviceAccount
            )
    });

}


const db =
    admin.firestore();

const firebaseAuth =
    admin.auth();


/* =====================================================
   OPENAI
===================================================== */

const openai =
    new OpenAI({
        apiKey:
            process.env.OPENAI_API_KEY
    });


/* =====================================================
   RAZORPAY
===================================================== */

let razorpay = null;


if (
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
) {

    razorpay =
        new Razorpay({

            key_id:
                process.env.RAZORPAY_KEY_ID,

            key_secret:
                process.env.RAZORPAY_KEY_SECRET

        });

}


/* =====================================================
   IMAGE UPLOAD
===================================================== */

const upload =
    multer({

        storage:
            multer.memoryStorage(),

        limits: {

            fileSize:
                10 * 1024 * 1024

        },

        fileFilter:
            (req, file, cb) => {

                const allowed =
                    [
                        "image/jpeg",
                        "image/png",
                        "image/webp"
                    ];


                if (
                    allowed.includes(
                        file.mimetype
                    )
                ) {

                    cb(
                        null,
                        true
                    );

                } else {

                    cb(
                        new Error(
                            "Only JPG, PNG or WEBP images are allowed."
                        )
                    );

                }

            }

    });


/* =====================================================
   FIREBASE AUTH MIDDLEWARE
===================================================== */

async function authenticate(
    req,
    res,
    next
) {

    try {

        const header =
            req.headers.authorization ||
            "";


        if (
            !header.startsWith(
                "Bearer "
            )
        ) {

            return res
                .status(401)
                .json({

                    success: false,

                    error:
                        "Authentication required."

                });

        }


        const token =
            header.substring(7);


        const decoded =
            await firebaseAuth
                .verifyIdToken(
                    token
                );


        req.user =
            decoded;


        next();

    } catch (error) {

        console.error(
            "Firebase authentication error:",
            error
        );


        return res
            .status(401)
            .json({

                success: false,

                error:
                    "Invalid Firebase authentication."

            });

    }

}


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            service:
                "MedZoneX",

            server:
                "online",

            time:
                new Date().toISOString()

        });

    }
);


/* =====================================================
   PROFILE
===================================================== */

app.get(
    "/api/profile",
    authenticate,
    async (req, res) => {

        try {

            const ref =
                db
                    .collection("users")
                    .doc(
                        req.user.uid
                    );


            const snapshot =
                await ref.get();


            if (
                !snapshot.exists
            ) {

                return res
                    .status(404)
                    .json({

                        success: false,

                        error:
                            "Profile not found."

                    });

            }


            const data =
                snapshot.data();


            res.json({

                success: true,

                profile: data

            });

        } catch (error) {

            console.error(
                "Profile error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Unable to load profile."

                });

        }

    }
);


/* =====================================================
   UPDATE PROFILE
===================================================== */

app.put(
    "/api/profile",
    authenticate,
    async (req, res) => {

        try {

            const {

                storeName,

                medicalStoreName,

                ownerName,

                phone,

                mobile,

                email

            } = req.body;


            const ref =
                db
                    .collection("users")
                    .doc(
                        req.user.uid
                    );


            await ref.set(

                {

                    storeName:
                        storeName ||
                        medicalStoreName ||
                        "",

                    ownerName:
                        ownerName ||
                        "",

                    phone:
                        phone ||
                        mobile ||
                        "",

                    email:
                        email ||
                        req.user.email ||
                        "",

                    updatedAt:
                        admin.firestore
                            .FieldValue
                            .serverTimestamp()

                },

                {
                    merge: true
                }

            );


            res.json({

                success: true,

                message:
                    "Profile updated."

            });

        } catch (error) {

            console.error(
                "Profile update error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Profile could not be updated."

                });

        }

    }
);


/* =====================================================
   AI PRODUCT / MEDICINE RECOGNITION
===================================================== */

app.post(
    "/api/recognize-medicine",
    authenticate,
    upload.single("image"),
    async (req, res) => {

        try {

            if (
                !req.file
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Product image is required."

                    });

            }


            if (
                !process.env.OPENAI_API_KEY
            ) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "OPENAI_API_KEY is not configured."

                    });

            }


            const base64 =
                req.file.buffer
                    .toString(
                        "base64"
                    );


            const mime =
                req.file.mimetype;


            const response =
                await openai.responses.create({

                    model:
                        process.env.OPENAI_VISION_MODEL ||
                        "gpt-5.6",

                    input: [

                        {

                            role:
                                "user",

                            content: [

                                {

                                    type:
                                        "input_text",

                                    text: `

You are the product recognition engine
for MedZoneX.

Identify a medicine, syrup, tablet,
capsule, cream, injection, supplement,
medical product, cosmetic or packaged
store product from the image.

IMPORTANT:

1. Barcode is NOT required.
2. Read the visible product/brand name.
3. If the product name is readable,
   return it even if other details are
   not visible.
4. Never invent information.
5. The user must CONFIRM the result
   before saving it.
6. If uncertain, return recognized=false.

Return ONLY valid JSON:

{
  "medicineName": "",
  "genericName": "",
  "strength": "",
  "manufacturer": "",
  "expiryDate": "",
  "mrp": null,
  "barcode": "",
  "confidence": 0,
  "recognized": false
}

Rules:

- confidence must be 0 to 1.
- mrp must be number or null.
- Do not guess expiry.
- Do not guess manufacturer.
- Do not guess generic name.
- Preserve visible brand spelling.
- Barcode is optional.
- Product recognition must primarily
  depend on the visible package/label.
`

                                },

                                {

                                    type:
                                        "input_image",

                                    image_url:
                                        `data:${mime};base64,${base64}`

                                }

                            ]

                        }

                    ]

                });


            const text =
                (
                    response.output_text ||
                    ""
                )
                    .trim();


            let medicine;


            try {

                medicine =
                    JSON.parse(
                        text
                    );

            } catch (error) {

                console.error(
                    "AI returned invalid JSON:",
                    text
                );


                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "AI returned invalid product information."

                    });

            }


            res.json({

                success: true,

                medicine

            });

        } catch (error) {

            console.error(
                "AI recognition error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        error?.message ||
                        "Product recognition failed."

                });

        }

    }
);


/* =====================================================
   ALIAS FOR CURRENT FRONTEND
===================================================== */

app.post(
    "/api/recognize-product",
    authenticate,
    upload.single("image"),
    async (req, res) => {

        try {

            if (
                !req.file
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Product image is required."

                    });

            }


            const base64 =
                req.file.buffer
                    .toString(
                        "base64"
                    );


            const mime =
                req.file.mimetype;


            const response =
                await openai.responses.create({

                    model:
                        process.env.OPENAI_VISION_MODEL ||
                        "gpt-5.6",

                    input: [

                        {

                            role:
                                "user",

                            content: [

                                {

                                    type:
                                        "input_text",

                                    text: `

Identify the packaged medical-store
product in this image.

Return ONLY JSON:

{
 "medicineName":"",
 "genericName":"",
 "strength":"",
 "manufacturer":"",
 "expiryDate":"",
 "mrp":null,
 "barcode":"",
 "confidence":0,
 "recognized":false
}

Do not invent fields.
Barcode is not required.
Recognize using visible package text.
`

                                },

                                {

                                    type:
                                        "input_image",

                                    image_url:
                                        `data:${mime};base64,${base64}`

                                }

                            ]

                        }

                    ]

                });


            let result;


            try {

                result =
                    JSON.parse(
                        response.output_text.trim()
                    );

            } catch (error) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "AI returned invalid JSON."

                    });

            }


            res.json({

                success: true,

                medicine:
                    result,

                product:
                    result

            });

        } catch (error) {

            console.error(
                "Product recognition error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Product recognition failed."

                });

        }

    }
);


/* =====================================================
   SAVE STOCK
===================================================== */

app.post(
    "/api/stock",
    authenticate,
    async (req, res) => {

        try {

            const body =
                req.body || {};


            const medicineName =
                body.medicineName ||
                body.name ||
                "";


            if (
                !medicineName.trim()
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Product name is required."

                    });

            }


            const genericName =
                body.genericName ||
                "";


            const strength =
                body.strength ||
                "";


            const manufacturer =
                body.manufacturer ||
                body.companyName ||
                "";


            const expiryDate =
                body.expiryDate ||
                body.expireDate ||
                "";


            const mrp =
                body.mrp === "" ||
                body.mrp === null ||
                body.mrp === undefined
                    ? null
                    : Number(
                        body.mrp
                    );


            const costPrice =
                Number(
                    body.costPrice ||
                    0
                );


            const sellingPrice =
                Number(
                    body.sellingPrice ||
                    0
                );


            const quantity =
                Number(
                    body.quantity ||
                    0
                );


            const maxStock =
                Number(
                    body.maxStock ||
                    body.maximumStock ||
                    0
                );


            const lowStockAt =
                Number(
                    body.lowStockAt ??
                    body.minimumStock ??
                    body.lowStockAlert ??
                    10
                );


            const barcode =
                body.barcode ||
                "";


            const profitPerUnit =
                sellingPrice -
                costPrice;


            const uid =
                req.user.uid;


            const stockRef =
                db
                    .collection("users")
                    .doc(uid)
                    .collection("stock")
                    .doc();


            const stockData = {

                id:
                    stockRef.id,

                name:
                    medicineName.trim(),

                medicineName:
                    medicineName.trim(),

                genericName:
                    String(
                        genericName
                    ),

                strength:
                    String(
                        strength
                    ),

                manufacturer:
                    String(
                        manufacturer
                    ),

                companyName:
                    String(
                        manufacturer
                    ),

                expiryDate:
                    String(
                        expiryDate
                    ),

                mrp:
                    mrp,

                costPrice:
                    costPrice,

                sellingPrice:
                    sellingPrice,

                profitPerUnit:
                    profitPerUnit,

                quantity:
                    quantity,

                maxStock:
                    maxStock,

                lowStockAt:
                    lowStockAt,

                minimumStock:
                    lowStockAt,

                lowStockAlert:
                    lowStockAt,

                barcode:
                    String(
                        barcode
                    ),

                createdAt:
                    admin.firestore
                        .FieldValue
                        .serverTimestamp(),

                updatedAt:
                    admin.firestore
                        .FieldValue
                        .serverTimestamp()

            };


            await stockRef.set(
                stockData
            );


            res.json({

                success: true,

                id:
                    stockRef.id,

                stock:
                    stockData

            });

        } catch (error) {

            console.error(
                "Stock save error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Stock could not be saved."

                });

        }

    }
);


/* =====================================================
   GET STOCK
===================================================== */

app.get(
    "/api/stock",
    authenticate,
    async (req, res) => {

        try {

            const snapshot =
                await db
                    .collection("users")
                    .doc(
                        req.user.uid
                    )
                    .collection("stock")
                    .orderBy(
                        "createdAt",
                        "desc"
                    )
                    .get();


            const stock =
                snapshot.docs.map(
                    doc => ({

                        id:
                            doc.id,

                        ...doc.data()

                    })
                );


            res.json({

                success: true,

                stock

            });

        } catch (error) {

            /*
             * If createdAt ordering causes
             * an index problem, fallback
             * to unordered read.
             */

            try {

                const snapshot =
                    await db
                        .collection("users")
                        .doc(
                            req.user.uid
                        )
                        .collection("stock")
                        .get();


                const stock =
                    snapshot.docs.map(
                        doc => ({

                            id:
                                doc.id,

                            ...doc.data()

                        })
                    );


                return res.json({

                    success: true,

                    stock

                });

            } catch (secondError) {

                console.error(
                    "Get stock error:",
                    secondError
                );


                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "Unable to load stock."

                    });

            }

        }

    }
);


/* =====================================================
   UPDATE STOCK
===================================================== */

app.put(
    "/api/stock/:id",
    authenticate,
    async (req, res) => {

        try {

            const id =
                req.params.id;


            if (
                !id
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Stock ID required."

                    });

            }


            const ref =
                db
                    .collection("users")
                    .doc(
                        req.user.uid
                    )
                    .collection("stock")
                    .doc(id);


            const snap =
                await ref.get();


            if (
                !snap.exists
            ) {

                return res
                    .status(404)
                    .json({

                        success: false,

                        error:
                            "Product not found."

                    });

            }


            const updates =
                req.body || {};


            delete updates.id;
            delete updates.createdAt;


            if (
                updates.costPrice !==
                undefined
            ) {

                updates.costPrice =
                    Number(
                        updates.costPrice
                    );

            }


            if (
                updates.sellingPrice !==
                undefined
            ) {

                updates.sellingPrice =
                    Number(
                        updates.sellingPrice
                    );

            }


            if (
                updates.quantity !==
                undefined
            ) {

                updates.quantity =
                    Number(
                        updates.quantity
                    );

            }


            if (
                updates.maxStock !==
                undefined
            ) {

                updates.maxStock =
                    Number(
                        updates.maxStock
                    );

            }


            if (
                updates.lowStockAt !==
                undefined
            ) {

                updates.lowStockAt =
                    Number(
                        updates.lowStockAt
                    );

                updates.minimumStock =
                    updates.lowStockAt;

                updates.lowStockAlert =
                    updates.lowStockAt;

            }


            const current =
                snap.data();


            const cost =
                updates.costPrice !==
                undefined
                    ? updates.costPrice
                    : Number(
                        current.costPrice ||
                        0
                    );


            const selling =
                updates.sellingPrice !==
                undefined
                    ? updates.sellingPrice
                    : Number(
                        current.sellingPrice ||
                        0
                    );


            updates.profitPerUnit =
                selling -
                cost;


            updates.updatedAt =
                admin.firestore
                    .FieldValue
                    .serverTimestamp();


            await ref.update(
                updates
            );


            res.json({

                success: true,

                message:
                    "Stock updated."

            });

        } catch (error) {

            console.error(
                "Stock update error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Stock update failed."

                });

        }

    }
);


/* =====================================================
   DELETE STOCK
===================================================== */

app.delete(
    "/api/stock/:id",
    authenticate,
    async (req, res) => {

        try {

            await db
                .collection("users")
                .doc(
                    req.user.uid
                )
                .collection("stock")
                .doc(
                    req.params.id
                )
                .delete();


            res.json({

                success: true,

                message:
                    "Product deleted."

            });

        } catch (error) {

            console.error(
                "Stock delete error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Product could not be deleted."

                });

        }

    }
);


/* =====================================================
   SALE / BILLING
===================================================== */

app.post(
    "/api/sell",
    authenticate,
    async (req, res) => {

        try {

            const {

                stockId,

                quantity,

                customerPhone,

                customerName

            } = req.body;


            const soldQuantity =
                Number(
                    quantity
                );


            if (
                !stockId ||
                !Number.isFinite(
                    soldQuantity
                ) ||
                soldQuantity <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Valid product and quantity are required."

                    });

            }


            const stockRef =
                db
                    .collection("users")
                    .doc(
                        req.user.uid
                    )
                    .collection("stock")
                    .doc(
                        stockId
                    );


            const saleRef =
                db
                    .collection("users")
                    .doc(
                        req.user.uid
                    )
                    .collection("sales"
                    )
                    .doc();


            const result =
                await db.runTransaction(
                    async transaction => {

                        const stockSnap =
                            await transaction
                                .get(
                                    stockRef
                                );


                        if (
                            !stockSnap.exists
                        ) {

                            throw new Error(
                                "Product not found."
                            );

                        }


                        const product =
                            stockSnap.data();


                        const currentQty =
                            Number(
                                product.quantity ||
                                0
                            );


                        if (
                            currentQty <
                            soldQuantity
                        ) {

                            throw new Error(
                                `Insufficient stock. Available: ${currentQty}`
                            );

                        }


                        const price =
                            Number(
                                product.sellingPrice ||
                                0
                            );


                        const cost =
                            Number(
                                product.costPrice ||
                                0
                            );


                        const total =
                            price *
                            soldQuantity;


                        const profit =
                            (
                                price -
                                cost
                            ) *
                            soldQuantity;


                        const remaining =
                            currentQty -
                            soldQuantity;


                        transaction.update(
                            stockRef,
                            {

                                quantity:
                                    remaining,

                                updatedAt:
                                    admin.firestore
                                        .FieldValue
                                        .serverTimestamp()

                            }
                        );


                        transaction.set(
                            saleRef,
                            {

                                stockId:
                                    stockId,

                                productName:
                                    product.name ||
                                    product.medicineName ||
                                    "",

                                quantity:
                                    soldQuantity,

                                sellingPrice:
                                    price,

                                costPrice:
                                    cost,

                                total:
                                    total,

                                profit:
                                    profit,

                                customerPhone:
                                    String(
                                        customerPhone ||
                                        ""
                                    ),

                                customerName:
                                    String(
                                        customerName ||
                                        ""
                                    ),

                                soldAt:
                                    admin.firestore
                                        .FieldValue
                                        .serverTimestamp()

                            }
                        );


                        return {

                            product,
                            remaining,
                            total,
                            profit

                        };

                    }
                );


            /*
             * Notification is triggered AFTER
             * successful stock transaction.
             */

            let notification =
                null;


            if (
                customerPhone
            ) {

                notification =
                    await sendCustomerNotification(
                        req.user.uid,
                        {
                            phone:
                                customerPhone,

                            name:
                                customerName ||
                                "",

                            productName:
                                result.product
                                    .name ||
                                result.product
                                    .medicineName ||
                                "",

                            quantity:
                                soldQuantity,

                            total:
                                result.total

                        }
                    );

            }


            res.json({

                success: true,

                message:
                    "Product sold successfully.",

                saleId:
                    saleRef.id,

                remainingStock:
                    result.remaining,

                total:
                    result.total,

                profit:
                    result.profit,

                notification:
                    notification

            });

        } catch (error) {

            console.error(
                "Sale error:",
                error
            );


            res
                .status(400)
                .json({

                    success: false,

                    error:
                        error.message ||
                        "Sale failed."

                });

        }

    }
);


/* =====================================================
   SALES HISTORY
===================================================== */

app.get(
    "/api/sales",
    authenticate,
    async (req, res) => {

        try {

            const snapshot =
                await db
                    .collection("users")
                    .doc(
                        req.user.uid
                    )
                    .collection("sales")
                    .get();


            const sales =
                snapshot.docs.map(
                    doc => ({

                        id:
                            doc.id,

                        ...doc.data()

                    })
                );


            sales.sort(
                (
                    a,
                    b
                ) => {

                    const aTime =
                        a.soldAt?.toMillis?.() ||
                        0;


                    const bTime =
                        b.soldAt?.toMillis?.() ||
                        0;


                    return (
                        bTime -
                        aTime
                    );

                }
            );


            res.json({

                success: true,

                sales

            });

        } catch (error) {

            console.error(
                "Sales history error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Unable to load sales."

                });

        }

    }
);


/* =====================================================
   CUSTOMER NOTIFICATION
===================================================== */

async function sendCustomerNotification(
    uid,
    data
) {

    const phone =
        String(
            data.phone ||
            ""
        ).trim();


    if (
        !phone
    ) {

        return {

            success: false,

            status:
                "no_customer_number"

        };

    }


    const storeSnap =
        await db
            .collection("users")
            .doc(uid)
            .get();


    const store =
        storeSnap.exists
            ? storeSnap.data()
            : {};


    const storeName =
        store.storeName ||
        store.medicalStoreName ||
        "XYZ Medical Store";


    const message =
        `Congratulations on your visit to ${storeName}! ` +
        `Thank you for purchasing ${data.productName || "product"} ` +
        `with us. May God give you better health. ` +
        `Thank you for choosing ${storeName}.`;


    /*
     * IMPORTANT:
     *
     * Do NOT pretend that WhatsApp/SMS has been
     * sent unless an actual provider is configured.
     *
     * Configure:
     *
     * WHATSAPP_API_URL
     * WHATSAPP_ACCESS_TOKEN
     * WHATSAPP_PHONE_NUMBER_ID
     *
     * for WhatsApp Cloud API.
     */


    if (
        process.env.WHATSAPP_API_URL &&
        process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID
    ) {

        try {

            const response =
                await fetch(
                    process.env.WHATSAPP_API_URL,
                    {

                        method:
                            "POST",

                        headers: {

                            "Authorization":
                                `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify({

                                messaging_product:
                                    "whatsapp",

                                to:
                                    phone
                                        .replace(
                                            /^\+/,
                                            ""
                                        ),

                                type:
                                    "text",

                                text: {

                                    body:
                                        message

                                }

                            })

                    }
                );


            const result =
                await response.json();


            if (
                !response.ok
            ) {

                console.error(
                    "WhatsApp API error:",
                    result
                );


                return {

                    success: false,

                    status:
                        "whatsapp_api_error",

                    providerResponse:
                        result

                };

            }


            return {

                success: true,

                channel:
                    "whatsapp",

                providerResponse:
                    result

            };

        } catch (error) {

            console.error(
                "WhatsApp send error:",
                error
            );


            return {

                success: false,

                status:
                    "whatsapp_failed"

            };

        }

    }


    /*
     * No provider configured.
     */

    console.log(
        "\nCUSTOMER NOTIFICATION\n" +
        "To: " +
        phone +
        "\nMessage: " +
        message +
        "\n"
    );


    return {

        success: false,

        status:
            "notification_provider_not_configured",

        message:
            "Sale completed. Configure WhatsApp provider to send automatically."

    };

}


/* =====================================================
   CUSTOMER NOTIFICATION API
===================================================== */

app.post(
    "/api/customer-notification",
    authenticate,
    async (req, res) => {

        try {

            const {

                customerPhone,

                customerName,

                productName,

                quantity,

                total

            } = req.body;


            if (
                !customerPhone
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Customer phone number is required."

                    });

            }


            const result =
                await sendCustomerNotification(

                    req.user.uid,

                    {

                        phone:
                            customerPhone,

                        name:
                            customerName,

                        productName:
                            productName,

                        quantity:
                            quantity,

                        total:
                            total

                    }

                );


            res.json(
                result
            );

        } catch (error) {

            console.error(
                "Notification endpoint error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Customer notification failed."

                });

        }

    }
);


/* =====================================================
   RAZORPAY PLANS
===================================================== */

const PLANS = {

    "1": {

        months:
            1,

        amount:
            949

    },

    "6": {

        months:
            6,

        amount:
            899 * 6

    },

    "12": {

        months:
            12,

        amount:
            800 * 12

    }

};


/* =====================================================
   CREATE RAZORPAY ORDER
===================================================== */

app.post(
    "/api/create-order",
    authenticate,
    async (req, res) => {

        try {

            if (
                !razorpay
            ) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "Razorpay keys are not configured."

                    });

            }


            const plan =
                String(
                    req.body.plan
                );


            const requestedAmount =
                Number(
                    req.body.amount
                );


            const selected =
                PLANS[plan];


            if (
                !selected
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Invalid subscription plan."

                    });

            }


            if (
                requestedAmount !==
                selected.amount
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            `Plan amount mismatch. Expected ₹${selected.amount}.`

                    });

            }


            const order =
                await razorpay.orders.create({

                    amount:
                        selected.amount *
                        100,

                    currency:
                        "INR",

                    receipt:
                        "MSP_" +
                        Date.now(),

                    notes: {

                        uid:
                            req.user.uid,

                        plan:
                            plan,

                        months:
                            String(
                                selected.months
                            )

                    }

                });


            res.json({

                success: true,

                orderId:
                    order.id,

                id:
                    order.id,

                amount:
                    order.amount,

                currency:
                    order.currency,

                keyId:
                    process.env.RAZORPAY_KEY_ID

            });

        } catch (error) {

            console.error(
                "Razorpay order error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        error?.error?.description ||
                        error?.description ||
                        error?.message ||
                        "Unable to create payment order."

                });

        }

    }
);


/* =====================================================
   VERIFY RAZORPAY PAYMENT
===================================================== */

app.post(
    "/api/verify-payment",
    authenticate,
    async (req, res) => {

        try {

            const {

                razorpay_order_id,

                razorpay_payment_id,

                razorpay_signature,

                months

            } = req.body;


            if (
                !razorpay_order_id ||
                !razorpay_payment_id ||
                !razorpay_signature ||
                !months
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Incomplete payment verification data."

                    });

            }


            if (
                !process.env.RAZORPAY_KEY_SECRET
            ) {

                return res
                    .status(500)
                    .json({

                        success: false,

                        error:
                            "Razorpay secret is not configured."

                    });

            }


            const generatedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        process.env
                            .RAZORPAY_KEY_SECRET
                    )
                    .update(
                        razorpay_order_id +
                        "|" +
                        razorpay_payment_id
                    )
                    .digest(
                        "hex"
                    );


            if (
                generatedSignature !==
                razorpay_signature
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Payment verification failed."

                    });

            }


            const monthNumber =
                Number(
                    months
                );


            if (
                !PLANS[
                    String(
                        monthNumber
                    )
                ]
            ) {

                return res
                    .status(400)
                    .json({

                        success: false,

                        error:
                            "Invalid subscription duration."

                    });

            }


            const userRef =
                db
                    .collection("users")
                    .doc(
                        req.user.uid
                    );


            await userRef.set(

                {

                    paymentStatus:
                        "paid",

                    subscriptionMonths:
                        monthNumber,

                    subscriptionPlan:
                        `${monthNumber} Month Plan`,

                    razorpayPaymentId:
                        razorpay_payment_id,

                    razorpayOrderId:
                        razorpay_order_id,

                    paidAmount:
                        PLANS[
                            String(
                                monthNumber
                            )
                        ].amount,

                    paidAt:
                        admin.firestore
                            .FieldValue
                            .serverTimestamp()

                },

                {
                    merge: true
                }

            );


            const profile =
                (
                    await userRef.get()
                ).data();


            res.json({

                success: true,

                profile

            });

        } catch (error) {

            console.error(
                "Payment verification error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Payment verification error."

                });

        }

    }
);


/* =====================================================
   BUSINESS SUMMARY
===================================================== */

app.get(
    "/api/business-summary",
    authenticate,
    async (req, res) => {

        try {

            const snapshot =
                await db
                    .collection("users")
                    .doc(
                        req.user.uid
                    )
                    .collection("stock")
                    .get();


            let totalProducts =
                0;

            let totalUnits =
                0;

            let lowStock =
                0;

            let outOfStock =
                0;

            let totalValue =
                0;


            snapshot.forEach(
                doc => {

                    const item =
                        doc.data();


                    const quantity =
                        Number(
                            item.quantity ||
                            0
                        );


                    const cost =
                        Number(
                            item.costPrice ||
                            0
                        );


                    const minimum =
                        Number(
                            item.lowStockAt ??
                            item.minimumStock ??
                            item.lowStockAlert ??
                            10
                        );


                    totalProducts++;

                    totalUnits +=
                        quantity;

                    totalValue +=
                        quantity *
                        cost;


                    if (
                        quantity <= 0
                    ) {

                        outOfStock++;

                    }
                    else if (
                        quantity <=
                        minimum
                    ) {

                        lowStock++;

                    }

                }
            );


            res.json({

                success: true,

                totalProducts,

                totalUnits,

                lowStock,

                outOfStock,

                totalStockValue:
                    totalValue

            });

        } catch (error) {

            console.error(
                "Business summary error:",
                error
            );


            res
                .status(500)
                .json({

                    success: false,

                    error:
                        "Unable to load business summary."

                });

        }

    }
);


/* =====================================================
   WEBSITE FALLBACK
===================================================== */

app.get(
    "*",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );

    }
);


/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "SERVER ERROR:",
            error
        );


        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }


        res
            .status(
                error.status ||
                400
            )
            .json({

                success: false,

                error:
                    error.message ||
                    "Something went wrong."

            });

    }
);


/* =====================================================
   START SERVER
===================================================== */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "MedZoneX Server Started"
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            `Local: http://localhost:${PORT}`
        );

        console.log(
            "======================================"
        );

    }
);