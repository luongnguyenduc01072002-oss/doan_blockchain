-- Bảng sản phẩm (chạy trên TiDB Cloud / MySQL)
CREATE TABLE IF NOT EXISTS products (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(120)   NOT NULL,
  description    VARCHAR(500)   NOT NULL DEFAULT '',
  price          DECIMAL(36,18) NOT NULL,          -- giá ETH, giữ đủ 18 chữ số thập phân
  image_url      VARCHAR(1000)  NOT NULL,
  seller_address CHAR(42)       NOT NULL,
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_seller (seller_address)
) DEFAULT CHARSET = utf8mb4;

-- Nếu bảng cũ đã có, chỉ cần thêm cột mô tả:
-- ALTER TABLE products ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT '' AFTER name;

-- ===== Trao đổi theo đơn hàng (server tự tạo khi khởi động, xem chat.js) =====
-- Mỗi đơn on-chain có 1 luồng; buyer/seller chép từ hợp đồng lúc tin đầu tiên được gửi
CREATE TABLE IF NOT EXISTS order_threads (
  order_id   BIGINT PRIMARY KEY,                 -- = orderId trong hợp đồng
  buyer      CHAR(42) NOT NULL,
  seller     CHAR(42) NOT NULL,
  disputed   TINYINT(1) NOT NULL DEFAULT 0,      -- đã từng khiếu nại -> Admin được xem lại
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_buyer (buyer), INDEX idx_seller (seller)
) DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS order_messages (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT NOT NULL,
  sender         CHAR(42) NOT NULL,
  role           VARCHAR(10) NOT NULL,            -- buyer | seller | admin
  kind           VARCHAR(12) NOT NULL DEFAULT 'text', -- text | shipping | tracking | dispute
  body           VARCHAR(1000) NOT NULL,
  attachment_url VARCHAR(2048) NULL,              -- link ảnh / video bằng chứng
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order (order_id, id)
) DEFAULT CHARSET = utf8mb4;

-- Tin cuối mỗi người đã đọc trong từng đơn -> đếm tin chưa đọc
CREATE TABLE IF NOT EXISTS thread_reads (
  order_id     BIGINT NOT NULL,
  address      CHAR(42) NOT NULL,
  last_read_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, address)
) DEFAULT CHARSET = utf8mb4;
