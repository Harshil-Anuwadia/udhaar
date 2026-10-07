import Razorpay from 'razorpay';

function provider() {
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

// One boundary for gateway I/O; tests replace this with deterministic fixtures.
export const paymentGateway = {
  createOrder: (order) => provider().orders.create(order),
  fetchOrder: (id) => provider().orders.fetch(id),
  fetchPayment: (id) => provider().payments.fetch(id),
};
