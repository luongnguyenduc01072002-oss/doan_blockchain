// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract Escrow {
    address public buyer;
    address payable public seller;
    address public arbiter; // Người phân xử (Admin) trong trường hợp có tranh chấp
    uint public amount;

    enum State { AWAITING_PAYMENT, AWAITING_DELIVERY, COMPLETE, REFUNDED }
    State public currentState;

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Chi nguoi mua moi duoc goi ham nay");
        _;
    }

    modifier onlySeller() {
        require(msg.sender == seller, "Chi nguoi ban moi duoc goi ham nay");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Chi Admin moi duoc goi ham nay");
        _;
    }

    modifier inState(State expectedState) {
        require(currentState == expectedState, "Trang thai giao dich khong hop le");
        _;
    }

    event PaymentDeposited(address indexed buyer, uint amount);
    event DeliveryConfirmed(address indexed buyer, address indexed seller, uint amount);
    event PaymentRefunded(address indexed buyer, uint amount);

    // Khởi tạo giao dịch với địa chỉ người bán và admin
    constructor(address payable _seller, address _arbiter) {
        buyer = msg.sender;
        seller = _seller;
        arbiter = _arbiter;
        currentState = State.AWAITING_PAYMENT;
    }

    // Bước 1: Người mua nạp ETH vào Smart Contract để khóa tiền
    function depositPayment() external payable onlyBuyer inState(State.AWAITING_PAYMENT) {
        require(msg.value > 0, "So tien nap vao phai lon hon 0");
        amount = msg.value;
        currentState = State.AWAITING_DELIVERY;
        emit PaymentDeposited(msg.sender, msg.value);
    }

    // Bước 2: Người mua xác nhận đã nhận hàng, Smart Contract tự động chuyển tiền cho người bán
    function confirmDelivery() external onlyBuyer inState(State.AWAITING_DELIVERY) {
        currentState = State.COMPLETE;
        
        (bool success, ) = seller.call{value: amount}("");
        require(success, "Loi khi chuyen tien cho nguoi ban");
        
        emit DeliveryConfirmed(buyer, seller, amount);
    }

    // Bước 3: Hoàn tiền cho người mua (Do Admin hoặc Người bán quyết định hủy giao dịch)
    function refundBuyer() external inState(State.AWAITING_DELIVERY) {
        require(msg.sender == arbiter || msg.sender == seller, "Chi Admin hoac Nguoi ban moi duoc hoan tien");
        currentState = State.REFUNDED;
        
        (bool success, ) = payable(buyer).call{value: amount}("");
        require(success, "Loi khi hoan tien cho nguoi mua");
        
        emit PaymentRefunded(buyer, amount);
    }

    // Kiểm tra số dư đang bị khóa trong hợp đồng
    function getBalance() external view returns (uint) {
        return address(this).balance;
    }
}