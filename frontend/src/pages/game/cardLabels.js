// Single source of truth for card labels + descriptions shown across the
// game (hand tooltips, action modal, summary). Keys mirror the backend
// CardCatalog (no "-1" suffix) so the same lookup works for both the
// player's hand and any future discard-pile rendering.

export const CARD_LABELS = {
  bomb: {
    label: "Bom",
    description: "Nổ ngay khi bạn rút phải. Trừ khi bạn có lá Cứu để hóa giải.",
  },
  defuse: {
    label: "Cứu (1 mệnh)",
    description: "Tự dùng để hóa giải bom. Đặt bom vào vị trí bất kỳ trong chồng bài.",
  },
  attack: {
    label: "Tấn công",
    description: "Đối phương phải chơi thêm 1 lượt, bạn không phải rút bài.",
  },
  skip: {
    label: "Bỏ lượt",
    description: "Kết thúc lượt của bạn. Nếu đang chịu tấn công thì tiêu hao lượt đó.",
  },
  favor: {
    label: "Xin",
    description: "Lấy 1 lá ngẫu nhiên từ 1 đối thủ còn sống.",
  },
  future: {
    label: "Xem trước",
    description: "Xem 3 lá trên cùng chồng bài rồi úp xuống lại theo đúng thứ tự.",
  },
  shuffle: {
    label: "Xáo bài",
    description: "Trộn lại toàn bộ chồng bài.",
  },
  nope: {
    label: "Cản",
    description: "Huỷ hành động vừa được thực hiện trong vòng 3 giây. Có thể nối nhiều Cản liên tiếp.",
  },
  ninja: {
    label: "Ninja",
    description: "Combo 2 lá cùng tên: lấy 1 lá úp từ tay đối thủ (chọn lá cụ thể).",
  },
  superman: {
    label: "Siêu nhân",
    description: "Combo 2/3 lá cùng tên. 2 lá: lấy lá úp; 3 lá: yêu cầu đối thủ đưa lá chỉ định.",
  },
  zombie: {
    label: "Xác sống",
    description: "Combo 2/3 lá cùng tên. 2 lá: lấy lá úp; 3 lá: yêu cầu đối thủ đưa lá chỉ định.",
  },
  robot: {
    label: "Robot",
    description: "Combo 2/3 lá cùng tên. 2 lá: lấy lá úp; 3 lá: yêu cầu đối thủ đưa lá chỉ định.",
  },
  "hải-tặc": {
    label: "Hải tặc",
    description: "Combo 2/3 lá cùng tên. 5 lá bất kỳ: lấy 1 lá từ chồng bỏ.",
  },
  "hải tặc": {
    label: "Hải tặc",
    description: "Combo 2/3 lá cùng tên. 5 lá bất kỳ: lấy 1 lá từ chồng bỏ.",
  },
};

export function getCardLabel(key) {
  return CARD_LABELS[key] || { label: key || "?", description: "" };
}
