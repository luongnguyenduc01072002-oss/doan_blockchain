// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  EscrowMarketplace
 * @notice Hợp đồng trung gian giữ tiền (escrow) cho chợ điện tử.
 *         Một hợp đồng phục vụ NHIỀU đơn hàng; mỗi đơn có người mua, người bán,
 *         số tiền và trạng thái riêng.
 *
 * Luồng chuẩn:
 *   createOrder (người mua nạp ETH)  ->  FUNDED
 *   markShipped (người bán báo đã gửi) ->  SHIPPED
 *   confirmDelivery (người mua nhận)  ->  COMPLETED  (tiền chuyển cho người bán)
 *
 * Luồng ngoại lệ:
 *   cancelByBuyer    : người mua hủy khi người bán CHƯA gửi hàng -> REFUNDED
 *   refundBySeller   : người bán chủ động hủy        -> REFUNDED
 *   openDispute      : sau khi gửi hàng, 1 trong 2 bên khiếu nại -> DISPUTED
 *   resolveDispute   : Admin (arbiter) phân xử        -> COMPLETED hoặc REFUNDED
 *   claimAfterTimeout: người mua im lặng quá hạn sau khi hàng đã gửi
 *                      -> người bán tự rút tiền      -> COMPLETED
 */
contract EscrowMarketplace {
    enum Status { NONE, FUNDED, SHIPPED, DISPUTED, COMPLETED, REFUNDED }

    struct Order {
        uint256 id;
        uint256 productId;      // id sản phẩm trong CSDL off-chain
        address payable buyer;
        address payable seller;
        uint256 amount;         // wei
        Status status;
        uint64 createdAt;
        uint64 shippedAt;
    }

    address public immutable arbiter;          // Admin phân xử tranh chấp
    uint256 public immutable autoReleasePeriod; // giây chờ trước khi người bán được tự rút

    uint256 public orderCount;
    mapping(uint256 => Order) private orders;

    bool private locked; // chống reentrancy

    // ----------------------------------------------------------------- events
    event OrderCreated(uint256 indexed orderId, uint256 indexed productId, address indexed buyer, address seller, uint256 amount);
    event OrderShipped(uint256 indexed orderId, uint256 shippedAt);
    event DeliveryConfirmed(uint256 indexed orderId, address indexed seller, uint256 amount);
    event OrderRefunded(uint256 indexed orderId, address indexed buyer, uint256 amount);
    event DisputeOpened(uint256 indexed orderId, address indexed openedBy);
    event DisputeResolved(uint256 indexed orderId, bool releasedToSeller);

    // -------------------------------------------------------------- modifiers
    modifier nonReentrant() {
        require(!locked, "Dang xu ly giao dich khac");
        locked = true;
        _;
        locked = false;
    }

    modifier orderExists(uint256 orderId) {
        require(orderId > 0 && orderId <= orderCount, "Don hang khong ton tai");
        _;
    }

    modifier onlyBuyer(uint256 orderId) {
        require(msg.sender == orders[orderId].buyer, "Chi nguoi mua cua don nay");
        _;
    }

    modifier onlySeller(uint256 orderId) {
        require(msg.sender == orders[orderId].seller, "Chi nguoi ban cua don nay");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Chi Admin phan xu");
        _;
    }

    constructor(address _arbiter, uint256 _autoReleasePeriod) {
        require(_arbiter != address(0), "Arbiter khong hop le");
        arbiter = _arbiter;
        autoReleasePeriod = _autoReleasePeriod;
    }

    // ------------------------------------------------------------ người mua
    /// @notice Người mua tạo đơn và khóa ETH vào hợp đồng.
    function createOrder(uint256 productId, address payable seller)
        external
        payable
        returns (uint256 orderId)
    {
        require(msg.value > 0, "So tien phai lon hon 0");
        require(seller != address(0), "Dia chi nguoi ban khong hop le");
        require(seller != msg.sender, "Khong the tu mua hang cua minh");
        // Người phân xử phải trung lập: nếu Admin cũng là người bán, Admin có thể tự mở
        // tranh chấp rồi tự xử cho mình thắng mà không cần giao hàng.
        require(seller != arbiter && msg.sender != arbiter, "Admin khong duoc tham gia giao dich");

        orderId = ++orderCount;
        orders[orderId] = Order({
            id: orderId,
            productId: productId,
            buyer: payable(msg.sender),
            seller: seller,
            amount: msg.value,
            status: Status.FUNDED,
            createdAt: uint64(block.timestamp),
            shippedAt: 0
        });

        emit OrderCreated(orderId, productId, msg.sender, seller, msg.value);
    }

    /// @notice Người mua xác nhận đã nhận hàng -> giải ngân cho người bán.
    ///         Chỉ được gọi SAU KHI người bán đã báo gửi hàng (đúng thứ tự nghiệp vụ).
    function confirmDelivery(uint256 orderId)
        external
        nonReentrant
        orderExists(orderId)
        onlyBuyer(orderId)
    {
        Order storage o = orders[orderId];
        require(o.status == Status.SHIPPED, "Nguoi ban chua gui hang");

        o.status = Status.COMPLETED;              // Effects trước
        _send(o.seller, o.amount);               // Interactions sau
        emit DeliveryConfirmed(orderId, o.seller, o.amount);
    }

    /// @notice Người mua hủy đơn khi người bán chưa gửi hàng -> nhận lại tiền ngay.
    function cancelByBuyer(uint256 orderId)
        external
        nonReentrant
        orderExists(orderId)
        onlyBuyer(orderId)
    {
        Order storage o = orders[orderId];
        require(o.status == Status.FUNDED, "Nguoi ban da gui hang, khong the tu huy");
        o.status = Status.REFUNDED;
        _send(o.buyer, o.amount);
        emit OrderRefunded(orderId, o.buyer, o.amount);
    }

    // ------------------------------------------------------------- người bán
    /// @notice Người bán báo đã gửi hàng, bắt đầu tính hạn tự giải ngân.
    function markShipped(uint256 orderId)
        external
        orderExists(orderId)
        onlySeller(orderId)
    {
        Order storage o = orders[orderId];
        require(o.status == Status.FUNDED, "Chi danh dau gui hang khi don dang cho");
        o.status = Status.SHIPPED;
        o.shippedAt = uint64(block.timestamp);
        emit OrderShipped(orderId, block.timestamp);
    }

    /// @notice Người bán chủ động hủy đơn và hoàn tiền cho người mua.
    function refundBySeller(uint256 orderId)
        external
        nonReentrant
        orderExists(orderId)
        onlySeller(orderId)
    {
        Order storage o = orders[orderId];
        require(
            o.status == Status.FUNDED || o.status == Status.SHIPPED || o.status == Status.DISPUTED,
            "Trang thai khong cho phep hoan tien"
        );
        o.status = Status.REFUNDED;
        _send(o.buyer, o.amount);
        emit OrderRefunded(orderId, o.buyer, o.amount);
    }

    /// @notice Hàng đã gửi, người mua im lặng quá hạn -> người bán được rút tiền.
    function claimAfterTimeout(uint256 orderId)
        external
        nonReentrant
        orderExists(orderId)
        onlySeller(orderId)
    {
        Order storage o = orders[orderId];
        require(o.status == Status.SHIPPED, "Don chua o trang thai da gui hang");
        require(block.timestamp >= o.shippedAt + autoReleasePeriod, "Chua het thoi gian cho");

        o.status = Status.COMPLETED;
        _send(o.seller, o.amount);
        emit DeliveryConfirmed(orderId, o.seller, o.amount);
    }

    // ------------------------------------------------------------- tranh chấp
    /// @notice Người mua hoặc người bán mở tranh chấp, đóng băng đơn chờ Admin.
    ///         Chỉ mở được SAU KHI đã gửi hàng: trước đó người mua có cancelByBuyer, người bán có
    ///         refundBySeller. Nếu cho mở sớm, người bán có thể "đóng băng" đơn để người mua không hủy được.
    function openDispute(uint256 orderId) external orderExists(orderId) {
        Order storage o = orders[orderId];
        require(msg.sender == o.buyer || msg.sender == o.seller, "Chi cac ben trong don");
        require(o.status == Status.SHIPPED, "Chi khieu nai sau khi nguoi ban gui hang");
        o.status = Status.DISPUTED;
        emit DisputeOpened(orderId, msg.sender);
    }

    /// @notice Admin phân xử: true = trả cho người bán, false = hoàn cho người mua.
    function resolveDispute(uint256 orderId, bool releaseToSeller)
        external
        nonReentrant
        orderExists(orderId)
        onlyArbiter
    {
        Order storage o = orders[orderId];
        require(o.status == Status.DISPUTED, "Don khong co tranh chap");

        if (releaseToSeller) {
            o.status = Status.COMPLETED;
            _send(o.seller, o.amount);
            emit DeliveryConfirmed(orderId, o.seller, o.amount);
        } else {
            o.status = Status.REFUNDED;
            _send(o.buyer, o.amount);
            emit OrderRefunded(orderId, o.buyer, o.amount);
        }
        emit DisputeResolved(orderId, releaseToSeller);
    }

    // ------------------------------------------------------------------ views
    function getOrder(uint256 orderId) external view orderExists(orderId) returns (Order memory) {
        return orders[orderId];
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // --------------------------------------------------------------- internal
    function _send(address payable to, uint256 value) private {
        (bool ok, ) = to.call{value: value}("");
        require(ok, "Chuyen ETH that bai");
    }
}
