import express from 'express';
import Razorpay from 'razorpay';
import bodyParser from 'body-parser';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const razorpay = new Razorpay({
  key_id: 'rzp_test_rk5UnQvaBl2fuh',
  key_secret: 'JFxP6Lm1Gdb2v0cQG0rtbvgc',
});

app.post('/razorpay', async (req, res) => {
  const payment_capture = 1;
  const amount = 50000; // Amount in paise
  const currency = 'INR';

  const options = {
    amount,
    currency,
    receipt: 'receipt_order_74394',
    payment_capture,
  };

  try {
    const response = await razorpay.orders.create(options);
    res.json({
      id: response.id,
      currency: response.currency,
      amount: response.amount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating order');
  }
});

app.post('/verify', (req, res) => {
  const { orderId, razorpayPaymentId, razorpaySignature } = req.body;

  const shasum = crypto.createHmac('sha256', 'JFxP6Lm1Gdb2v0cQG0rtbvgc');
  shasum.update(`${orderId}|${razorpayPaymentId}`);
  const digest = shasum.digest('hex');

  if (digest === razorpaySignature) {
    res.json({ status: 'success' });
  } else {
    res.status(400).json({ status: 'failure' });
  }
});

const PORT = 1769;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});