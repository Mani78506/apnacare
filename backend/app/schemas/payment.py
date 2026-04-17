from pydantic import BaseModel


class PaymentOrderCreate(BaseModel):
    booking_id: int


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class CashPaymentConfirmRequest(BaseModel):
    booking_id: int
