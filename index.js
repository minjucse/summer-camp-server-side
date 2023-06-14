const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.goerh3z.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();
    // Send a ping to confirm a successful connection
    app.get('/', (req, res) => {
      res.send('Server Api is running')
    });

    // Users Table 
    const usersCollection = client.db('campSchool').collection('users');
    const classesCollection = client.db('campSchool').collection('allClasses');
    const selectClassCollection = client.db('campSchool').collection('selectClass');
    const paymentCollection = client.db("campSchool").collection("payments");

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '24h' })

      res.send({ token })
    })

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "student") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden request" });
      }
      next();
    };

    // Users related apis start
    app.get('/api/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get('/api/all-users', async (req, res) => {
      const result = await usersCollection.find({ role: 'instructor' }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.post('/api/add-user', async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      user.role = 'student';
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch('/api/user/roleset', async (req, res) => {

      const filter = { _id: new ObjectId(req.body.id) };

      const updateDoc = {
        $set: {
          role: req.body.role
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })

    app.get('/api/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    app.get('/api/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result);
    })

    app.get('/api/users/student/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'student' }
      res.send(result);
    })
    // Users related apis end

    // Class related apis start
    app.get("/topclasses", async (req, res) => {
      const result = await classesCollection
        .find({ status: "approved" })
        .sort({ totalEnrolled: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });


    app.get('/api/class-list', verifyJWT, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    })

    app.post("/api/add-class", async (req, res) => {
      const body = req.body;
      body.createdAt = new Date();
      body.status = 'pending';
      const result = await classesCollection.insertOne(body);
      if (result?.insertedId) {
        return res.status(200).send(result);
      } else {
        return res.status(404).send({
          message: "can not insert try again leter",
          status: false,
        });
      }
    });

    app.patch('/api/class-update', async (req, res) => {
      const filter = { _id: new ObjectId(req.body.id) };

      const updateDoc = {
        $set: {
          status: req.body.status,
          feedback: req.body.feedback
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.get('/api/all-classes', async (req, res) => {
      const result = await classesCollection.find({ status: 'approved' }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.post("/api/add-select-class", async (req, res) => {
      const body = req.body;
      body.createdAt = new Date();

      const query = { classId: body.classId, studentEmail: body.studentEmail }
      const existingResult = await selectClassCollection.findOne(query);

      if (existingResult) {
        return res.send({ message: 'Already select' })
      }

      const result = await selectClassCollection.insertOne(body);
      if (result?.insertedId) {
        return res.status(200).send(result);
      } else {
        return res.status(404).send({
          message: "can not insert try again leter",
          status: false,
        });
      }
    });

    app.get('/api/all-select-class/:email',verifyJWT, async (req, res) => {
      const result = await selectClassCollection.find({ studentEmail: req.params.email }).sort({ createdAt: -1 }).toArray();
      res.send(result);
    });

    app.delete('/api/select-class/:id', async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) }
      const result = await selectClassCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/api/select-class/:id', verifyJWT,async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };

      const detail =await selectClassCollection.findOne(filter);
      
      res.send(detail)
    });

     //online Stipe Payment Api
     // create payment intent
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
        const amount = price * 100;
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "inr",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
    })
    // Class related apis end
    //student payment api
    app.post("/payments", verifyJWT, verifyStudent, async (req, res) => {
      const newPayment = req.body;
      const filter = { _id: new ObjectId(newPayment?.classItemId) };
      const classItems = await classesCollection.findOne(filter);
      const totalEnrolled = classItems.totalEnrolled + 1;
      const quantity = classItems.quantity - 1;
      const updateClassItems = {
        $set: { totalEnrolled, quantity },
      };
      const insertResult = await paymentCollection.insertOne(newPayment);
      const query = { _id: new ObjectId(newPayment?.cartItem) };
      const deleteResult = await selectClassCollection.deleteOne(query);
      const updateResult = await classesCollection.updateOne(
        filter,
        updateClassItems
      );
      res.send({ result: insertResult, deleteResult, updateResult });
    });
    // student enroll classes
    app.get("/enrollClasses", verifyJWT, verifyStudent, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const paymentResult = await paymentCollection.find(query).toArray();
      console.log(paymentResult);
      res.send(paymentResult);
    });

    // payment history for student classes

    app.get(
      "/student/paymentHistory",
      verifyJWT,
      verifyStudent,
      async (req, res) => {
        const email = req.query.email;
        const query = { email: email };
        const paymentResult = await paymentCollection
          .find(query)
          .sort({ _id: -1 })
          .toArray();
        res.send(paymentResult);
      }
    );

    // ___________________________________________________________________________________________________

    // top instructor
    app.get("/topInstructor", async (req, res) => {
      const classItems = await classesCollection.find({}).toArray();
      const filter = { role: "instructor" };
      const userResult = await usersCollection.find(filter).toArray();
      const userDetails = userResult.map((user) => {
        const userClass = classItems.filter(
          (item) => item?.instructorEmail === user?.email
        );
        const ClassDetail = {
          ClassName: userClass.map((item) => item.className),
          classImage: userClass.map((item) => item.classImage),
          classQuantity: userClass.length,
          classId: userClass.map((item) => item._id),
          totalEnrolled: userClass.reduce(
            (sum, item) => sum + item?.totalEnrolled,
            0
          ),
        };
        return { ...ClassDetail, ...user };
      });
      userDetails.sort((a, b) => b.totalEnrolled - a.totalEnrolled);
      const topInstructorDetails = userDetails?.slice(0, 6);

      res.send(topInstructorDetails);
    });

    // instructor related apis start
    // instructor related apis end

    // Student related apis start
    // Student related apis end

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server API is running on port ${port}`)
})