// npm i express multer aws-sdk body-parser dotenv

const express = require("express");
const PORT = 3000;
const app = express();
const multer = require("multer");
const AWS = require("aws-sdk");
const bodyParser = require("body-parser");

require("dotenv").config();
const path = require("path");
const { log } = require("console");

// cấu hình middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json({ extended: false }));
app.use(express.static("./pages"));

//config view
app.set("view engine", "ejs");
app.set("views", "pages");

//config aws
// process.env.AWS_SDK_JS_SUPPRESS_MAINTENACE_MODE_MESSAGE = "1";

//config aws sdk để truy cập vào cloud aws thông qua IAM user

AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3(); //khai báo service s3
const dynamodb = new AWS.DynamoDB.DocumentClient(); //khai báo service Dynamodb

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMO_TABLE_NAME;

//config multer để quản lý upload image
const storage = multer.memoryStorage({
  destination(req, file, callback) {
    callback(null, "");
  },
});
const upload = multer({
  storage,
  limits: {
    fileSize: 5000000,
  },
  fileFilter(req, file, callback) {
    checkFileType(file, callback);
  },
});

//hàm checkFileType
const checkFileType = (file, cb) => {
  const fileTypes = /jpeg|jpg|png|gif|ico/;
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  return cb("Error: pls upload images /jpeg|jpg|png|gif|ico/ only!");
};

//routers
app.get("/home", async (req, res) => {
  try {
    const params = { TableName: tableName };
    const data = await dynamodb.scan(params).promise();
    console.log("data= ", data.Items);
    return res.render("index.ejs", { data: data.Items });
  } catch (error) {
    console.log("Error retrieving data from DynamoDB: ", error);
    return res.status(500).send("Internal Server Error");
  }
});
//Lưu database lên Dynamodb
app.post("/save", upload.single("image"), (req, res) => {
  //middleware uploadsingle('image') chỉnh định rằng field có name image trong request sẽ được xử lý lọc

  try {
    // lấy tham số từ form
    const productID = Number(req.body.productID);
    const productName = req.body.productName;
    const quantity = Number(req.body.quantity);
    const image = req.file?.originalname.split(".");
    const fileType = image[image.length - 1];
    const filePath = `${productID}_${Date.now().toString()}.${fileType}`;

    const paramsS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read", // enable public access for this object
    };

    //đưa ảnh lên S3 trước
    s3.upload(paramsS3, async (err, data) => {
      if (err) {
        console.log("error", err);
        return res.send("Interna server error!");
      } else {
        const imageURL = data.Location; // gán URL S3 trả về vào field table Dyanmodb
        const paramsDynamoDb = {
          TableName: tableName,
          //đổ vào khuôn table dynamodb
          Item: {
            productID: Number(productID),
            productName: productName,
            quantity: quantity,
            image: imageURL,
          },
        };

        await dynamodb.put(paramsDynamoDb).promise();
        return res.redirect("/home"); //render lại trang
      }
    });
  } catch (error) {
    console.error("Error saving data from DynamoDB: ", error);
    return res.status(500).send("Internal server error");
  }
});

app.post("/delete", upload.fields([]), (req, res) => {
  const listCheckBoxSelected = Object.keys(req.body);
  console.log(listCheckBoxSelected);
  try {
    function onDeleteItem(index) {
      // Kết thúc đệ quy
      if (index < 0) {
        return res.redirect("/home");
      }
      const params = {
        TableName: tableName,
        Key: {
          productID: Number(listCheckBoxSelected[index]),
        },
      };
      try {
        dynamodb.delete(params).promise();
      } catch (error) {
        console.error("Error deleting item: ", error);
        return res.status(500).send("Internal Server Error!");
      }
      onDeleteItem(index - 1);
    }
    onDeleteItem(listCheckBoxSelected.length - 1);
  } catch (error) {}
});

app.listen(PORT, () => {
  console.log(`Server is running on : ${PORT}`);
});
