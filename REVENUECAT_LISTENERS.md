# RevenueCat 事件监听器说明

## 概述

我们有两个监听器来监听 RevenueCat Firebase Extension 写入的数据：

1. **`onNonSubscriptionPurchase`** - 监听非订阅购买
2. **`onEntitlementActivated`** - 监听权益激活

## 数据结构

RevenueCat Firebase Extension 将所有数据写入到 **`users/{uid}/`** 文档中，包括：
- `non_subscriptions` - 非订阅购买记录（map，key 是产品 ID，value 是购买记录数组）
- `entitlements` - 权益信息（map，key 是权益名称，value 包含 `expires_date` 等）
- `subscriptions` - 订阅信息
- `aliases` - 用户别名
- `profile` - 用户资料
- 等等

## 监听器详情

### 1. `onNonSubscriptionPurchase` - 非订阅购买监听器

**监听文档**：`users/{uid}`

**监听字段**：`non_subscriptions`

**数据来源**：RevenueCat Firebase Extension 写入的用户数据

**触发时机**：当 Extension 更新 `users/{uid}` 文档的 `non_subscriptions` 字段时

**处理逻辑**：
- 比较更新前后的 `non_subscriptions` 数据
- 检测是否有新的购买记录（数组长度增加）
- 如果有新购买，增加用户的 `paid_credit` 10 点

**数据结构示例**：
```json
{
  "non_subscriptions": {
    "com.sawell.aiapply.credit.10pack": [
      {
        "id": "...",
        "purchase_date": "...",
        "price": {...}
      }
    ]
  }
}
```

### 2. `onEntitlementActivated` - 权益激活监听器

**监听文档**：`users/{uid}`

**监听字段**：`entitlements`

**数据来源**：RevenueCat Firebase Extension 写入的用户数据

**触发时机**：当 Extension 更新 `users/{uid}` 文档的 `entitlements` 字段时

**处理逻辑**：
- 比较更新前后的 `entitlements` 数据
- 检测权益是否从非激活变为激活（基于 `expires_date` 判断）
- 如果有新激活的权益，重置用户的 `gift_credit` 为 10 点

**数据结构示例**：
```json
{
  "entitlements": {
    "Growth": {
      "expires_date": "2025-11-06T07:53:11Z",
      "product_identifier": "com.sawell.growth.monthly1",
      "purchase_date": "2025-11-06T07:50:11Z"
    }
  }
}
```

**权益激活判断**：
- 检查 `expires_date` 是否在未来
- 如果 `expires_date > 当前时间`，则认为权益激活

## 数据流

```
RevenueCat Webhook
    ↓
RevenueCat Firebase Extension
    ↓
Firestore 写入 users/{uid} 文档
    ├─ non_subscriptions 字段更新
    │   └─ 触发 onNonSubscriptionPurchase
    │       └─ 检测新购买 → 增加 paid_credit
    │
    └─ entitlements 字段更新
        └─ 触发 onEntitlementActivated
            └─ 检测权益激活 → 重置 gift_credit
```

## 两个监听器的区别

| 特性 | onNonSubscriptionPurchase | onEntitlementActivated |
|------|---------------------------|------------------------|
| **监听文档** | `users/{uid}` | `users/{uid}` |
| **监听字段** | `non_subscriptions` | `entitlements` |
| **检测方式** | 比较购买记录数组长度 | 比较 `expires_date` 状态 |
| **触发时机** | `non_subscriptions` 更新时 | `entitlements` 更新时 |
| **处理逻辑** | 检测新购买 → 增加 `paid_credit` | 检测权益激活 → 重置 `gift_credit` |
| **适用场景** | 非订阅购买（一次性产品） | 订阅激活/续费 |

## 验证监听器是否工作

### 验证 `onNonSubscriptionPurchase`

1. 进行一次非订阅购买
2. 检查 Firestore `users/{uid}` 文档的 `non_subscriptions` 字段是否有新记录
3. 查看 Functions 日志，应该看到：
   ```
   📦 检测到用户数据更新: <uid>
   ✅ 检测到新的非订阅购买: <productId>
   💰 检测到 X 个新的非订阅购买，为用户 ... 增加 10 点 paid_credit
   ✅ 已为用户 ... 增加 paid_credit
   ```
4. 检查 `credits/{uid}` 文档，`paid_credit` 应该增加 10 点

### 验证 `onEntitlementActivated`

1. 购买或续费一个订阅
2. 检查 Firestore `users/{uid}` 文档的 `entitlements` 字段，权益的 `expires_date` 应该在未来
3. 查看 Functions 日志，应该看到：
   ```
   🔄 检测到用户数据更新: <uid>
   ✅ 检测到权益激活: <entitlement_key>
   🎁 检测到 X 个权益激活，重置用户 ... 的 gift_credit 为 10 点
   ✅ 已重置用户 ... 的 gift_credit
   ```
4. 检查 `credits/{uid}` 文档，`gift_credit` 应该重置为 10 点

## 常见问题

### Q: 为什么需要两个监听器？

A: 
- `onNonSubscriptionPurchase` 处理**购买事件**（一次性购买）
- `onEntitlementActivated` 处理**权益状态**（订阅激活/续费）

两者监听的数据不同，处理逻辑也不同。

### Q: 如果只购买订阅，会触发哪个监听器？

A: 
- 购买订阅时，RevenueCat Extension 会更新 `users/{uid}` 文档：
  1. 更新 `subscriptions` 字段（订阅信息）
  2. 更新 `entitlements` 字段（权益激活）→ 触发 `onEntitlementActivated`
  3. 可能不会更新 `non_subscriptions`（订阅不是非订阅购买）

所以：
- `onNonSubscriptionPurchase` **不会**触发（因为没有更新 `non_subscriptions`）
- `onEntitlementActivated` **会**触发，检测到权益激活，**会**重置 `gift_credit`

### Q: 如果只购买一次性产品，会触发哪个监听器？

A:
- 购买一次性产品时，RevenueCat Extension 会更新 `users/{uid}` 文档：
  1. 更新 `non_subscriptions` 字段（非订阅购买）→ 触发 `onNonSubscriptionPurchase`
  2. 可能不会更新 `entitlements`（一次性产品通常不关联权益）

所以：
- `onNonSubscriptionPurchase` **会**触发，检测到新购买，**会**增加 `paid_credit`
- `onEntitlementActivated` **不会**触发（如果没有权益变化）

