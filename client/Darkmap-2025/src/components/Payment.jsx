import React from "react";
// import { auth, firestore } from "../firebase";
// import { doc, updateDoc, increment } from "firebase/firestore";

function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

const Payment = () => {
  const handlePayment = async () => {
    // const user = auth.currentUser;
    // if (!user) {
    //   alert("Please log in to make a payment.");
    //   return;
    // }

    // Check local storage for token as a proxy for logged in state
    const token = localStorage.getItem('accessToken');
    if (!token) {
      alert("Please log in to make a payment.");
      return;
    }

    const res = await loadScript('https://checkout.razorpay.com/v1/checkout.js');

    if (!res) {
      alert('Razorpay SDK failed to load. Are you online?');
      return;
    }

    try {
      const data = await fetch('http://localhost:1769/razorpay', { method: 'POST' })
        .then((t) => t.json());

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY, // Use the Razorpay key from .env
        amount: data.amount.toString(), // Amount in currency subunits
        currency: data.currency,
        name: "Your Company Name",
        description: "Add Credits",
        order_id: data.id, // Order ID from server
        handler: async function (response) {
          await fetch('http://localhost:1769/verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              // user_id: user.uid, // User ID should be inferred from token on backend
            }),
          });

          // Firestore update removed. Backend should handle credit updates.
          // const userRef = doc(firestore, "users", user.uid);
          // await updateDoc(userRef, {
          //   credits: increment(500), // Increment credits by 500
          // });
          alert("Payment successful! Credits added.");
        },
        prefill: {
          // email: user.email,
          email: "user@example.com" // Placeholder or decode from token if needed
        },
        theme: {
          color: "#3399cc",
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
    } catch (error) {
      console.error("Payment error:", error);
      alert("Payment initialization failed");
    }
  };

  return (
    <div>
      <h1>Payment Page</h1>
      <button onClick={handlePayment}>Pay ₹500 to Add Credits</button>
    </div>
  );
};

export default Payment; 