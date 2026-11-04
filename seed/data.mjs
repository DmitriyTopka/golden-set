// Synthetic demo data for "Northwind Gear", a fictional electronics shop.
// Invented from scratch: no real customer dialogues are used anywhere in this project.

export const SITE = 'https://northwind-demo.atlassian.net';

export const ARTICLES = [
  {
    pageId: '100001',
    title: 'Returns policy',
    body: [
      'You can return most items within 30 days of delivery.',
      'Returns are free: we email you a prepaid return label.',
      'Opened headphones and earbuds cannot be returned for hygiene reasons unless they are faulty.',
      'Opened laptops and tablets have a 15% restocking fee.',
      'Your refund is issued within 7 business days after the item reaches our warehouse.',
    ],
  },
  {
    pageId: '100002',
    title: 'Warranty',
    body: [
      'All Northwind Gear electronics come with a 2-year warranty from the date of purchase.',
      'Accessories such as cables, straps and cases have a 1-year warranty.',
      'The warranty covers manufacturing defects, not accidental damage or water damage.',
      'To make a claim, send us the serial number and a short video of the problem.',
      'Approved claims are repaired or replaced within 15 business days.',
      'Extended protection adds 3 years of cover for $49.',
    ],
  },
  {
    pageId: '100003',
    title: 'Delivery times',
    body: [
      'Standard delivery takes 4 business days.',
      'Express delivery arrives in 1 business day and costs $12.',
      'Orders over $75 ship free.',
      'We ship to all EU countries. International delivery outside the EU takes up to 10 business days.',
    ],
  },
  {
    pageId: '100004',
    title: 'Order cancellation',
    body: [
      'You can cancel an order free of charge within 2 hours of placing it.',
      'After 2 hours, if the order has not shipped, we charge a $5 handling fee.',
      'Once an order has shipped it cannot be cancelled. Please return it instead.',
      'Preorders can be cancelled any time before the release date.',
    ],
  },
  {
    pageId: '100005',
    title: 'Refund methods',
    body: [
      'Refunds go back to the original payment method.',
      'Card refunds appear on your statement within 3 business days after we issue them.',
      'PayPal refunds arrive within 24 hours.',
      'If you prefer, we can issue store credit with a 10% bonus.',
      'Gift card purchases are refunded as store credit only.',
    ],
  },
  {
    pageId: '100006',
    title: 'Damaged items',
    body: [
      'If your item arrives damaged, report it within 48 hours of delivery.',
      'Send us photos of the item and the box.',
      'We ship a replacement within 2 business days at no cost, or refund you in full.',
      'You do not need to return a damaged item worth under $30.',
    ],
  },
];

// The demo edit: the shop shortens the return window.
export const DEMO_EDIT = {
  pageId: '100001',
  from: 'You can return most items within 30 days of delivery.',
  to: 'You can return most items within 14 days of delivery.',
};

export const CUSTOMERS = [
  { id: 'cust-1', name: 'Jordan Blake', email: 'jordan.blake@example.com', phone: '+44 20 7946 0958' },
  { id: 'cust-2', name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+1 415 555 0132' },
  { id: 'cust-3', name: 'Tomasz Kowal', email: 'tomasz.kowal@example.com', phone: '+48 22 555 0147' },
  { id: 'cust-4', name: 'Emma Laurent', email: 'emma.laurent@example.com', phone: '+33 1 55 50 01 23' },
  { id: 'cust-5', name: 'Lucas Ferreira', email: 'lucas.ferreira@example.com', phone: '+351 21 555 0199' },
];

export const AGENTS = [
  { id: 'agent-1', name: 'Sam Rivera' },
  { id: 'agent-2', name: 'Mia Chen' },
];

// [pageId, question summary, customer detail, agent answer]
export const GOLDEN = [
  ['100001', 'Can I still return my smartwatch?', 'It arrived about three weeks ago and I do not like the strap.', 'You have 30 days from delivery to return it, so you are still in time.'],
  ['100001', 'Too late to return a keyboard?', 'The keyboard was delivered 25 days ago, unopened.', 'Not too late. The return window is 30 days from delivery.'],
  ['100001', 'Return period for a gift', 'My aunt sent me a speaker as a present. How long can I return it?', 'Gifts follow the same rule: 30 days from the delivery date.'],
  ['100001', 'Changed my mind about the tablet case', 'Can I send the case back? I never used it.', 'Yes, as long as it is within 30 days of delivery and in its original packaging.'],
  ['100001', 'Returning an unopened monitor', 'Monitor still sealed, delivered last month.', 'Our window is 30 days from delivery. If it arrived less than 30 days ago you can still return it.'],
  ['100001', 'What is your return policy for drones?', 'Thinking about buying the Falcon drone for my son.', 'Drones can be returned within 30 days of delivery like most items.'],
  ['100001', 'Do you accept returns on sale items?', 'I bought the earphones case in the autumn sale.', 'Yes, sale items have the same 30-day return window.'],
  ['100001', 'When does my return window end for the camera?', 'Bought the camera during the October promo.', 'You can return it within 30 days after it was delivered.'],
  ['100001', 'Do I have to pay for return shipping?', 'Want to send back a phone stand.', 'No, returns are free. We email you a prepaid return label.'],
  ['100001', 'Can I return opened earbuds?', 'Opened them once, the fit is wrong.', 'Opened headphones and earbuds cannot be returned for hygiene reasons unless they are faulty.'],
  ['100001', 'Fee for returning an opened laptop?', 'Opened the laptop but it is too heavy for me.', 'Yes, opened laptops and tablets have a 15% restocking fee.'],
  ['100001', 'When do I get my money back after a return?', 'Sent the parcel back yesterday.', 'We issue the refund within 7 business days after the item reaches our warehouse.'],

  ['100002', 'Warranty length on the X200 headphones', 'How long are they covered?', 'All our electronics come with a 2-year warranty from the date of purchase.'],
  ['100002', 'Is my charging cable under warranty?', 'The cable stopped working after five months.', 'Yes, accessories like cables and cases have a 1-year warranty.'],
  ['100002', 'Phone fell in water, covered?', 'Dropped it in the pool.', 'Sorry to hear that. The warranty covers manufacturing defects, not water damage.'],
  ['100002', 'How do I make a warranty claim?', 'My speaker crackles at high volume.', 'Send us the serial number and a short video of the problem, and we will review the claim.'],
  ['100002', 'How long does a warranty repair take?', 'Already sent my claim.', 'Approved claims are repaired or replaced within 15 business days.'],
  ['100002', 'What does extended protection cost?', 'Want extra cover for the new laptop.', 'Extended protection adds 3 years of cover for $49.'],
  ['100002', 'Laptop screen flickering after 18 months', 'Is this still under warranty?', 'Yes, that is within the 2-year warranty and a flickering screen counts as a manufacturing defect.'],
  ['100002', 'Cracked screen after a drop', 'Will the warranty pay for the repair?', 'No, accidental damage is not covered by the warranty, only manufacturing defects.'],
  ['100002', 'Smartwatch strap broke after 8 months', 'The clasp snapped.', 'Straps are accessories with a 1-year warranty, so it is covered.'],

  ['100003', 'How long does standard delivery take?', 'Ordering a router today.', 'Standard delivery takes 4 business days.'],
  ['100003', 'Do you have express shipping?', 'Need a charger quickly.', 'Yes, express delivery arrives in 1 business day and costs $12.'],
  ['100003', 'Is shipping free?', 'Planning a bigger order.', 'Orders over $75 ship free.'],
  ['100003', 'Do you ship to Canada?', 'I live in Toronto.', 'Yes. International delivery outside the EU takes up to 10 business days.'],
  ['100003', 'Will my order arrive before the weekend?', 'It is Tuesday now.', 'Standard delivery takes 4 business days, express arrives in 1 business day.'],
  ['100003', 'How much is express delivery?', 'Is it worth paying extra?', 'Express delivery costs $12 and arrives in 1 business day.'],
  ['100003', 'Do I pay shipping on a $70 order?', 'My basket is just under the limit.', 'Free shipping starts at $75, so a small delivery fee applies to a $70 order.'],
  ['100003', 'When does an order to Norway arrive?', 'Sending a gift to Oslo.', 'International delivery outside the EU takes up to 10 business days.'],

  ['100004', 'How do I cancel my order?', 'Ordered the wrong colour.', 'You can cancel free of charge within 2 hours of placing the order.'],
  ['100004', 'Ordered 3 hours ago, can I still cancel?', 'It has not shipped yet I think.', 'Yes, if it has not shipped. After 2 hours we charge a $5 handling fee.'],
  ['100004', 'Is there a cancellation fee?', 'Just checking before I order.', 'Cancelling is free within 2 hours. After that there is a $5 handling fee if the order has not shipped.'],
  ['100004', 'My order already shipped, can I cancel?', 'Tracking says it is on the way.', 'Shipped orders cannot be cancelled. Please return the item instead.'],
  ['100004', 'Can I cancel a preorder?', 'Preordered the new console.', 'Preorders can be cancelled any time before the release date.'],
  ['100004', 'Placed a duplicate order by mistake', 'Clicked buy twice 20 minutes ago.', 'No problem, cancellations within 2 hours of placing the order are free.'],
  ['100004', 'Why was I charged $5 after cancelling?', 'I cancelled in the evening.', 'Cancellations after 2 hours carry a $5 handling fee.'],

  ['100005', 'Where will my refund go?', 'Returned a mouse last week.', 'Refunds go back to the original payment method.'],
  ['100005', 'Refund issued but not on my card yet', 'You said it was refunded on Monday.', 'Card refunds appear on your statement within 3 business days after we issue them.'],
  ['100005', 'How fast are PayPal refunds?', 'Paid with PayPal.', 'PayPal refunds arrive within 24 hours.'],
  ['100005', 'Can I get store credit instead?', 'I will buy something else anyway.', 'Yes, we can issue store credit with a 10% bonus.'],
  ['100005', 'Refund for a gift card purchase', 'I paid with a gift card.', 'Gift card purchases are refunded as store credit only.'],
  ['100005', 'Bonus for choosing store credit?', 'A friend said there is an extra.', 'Store credit comes with a 10% bonus.'],
  ['100005', 'Refund to a different card?', 'My old card expired.', 'Refunds can only go back to the original payment method.'],

  ['100006', 'Package arrived with a broken speaker', 'The box was crushed.', 'Please report it within 48 hours of delivery and send photos of the item and the box.'],
  ['100006', 'What do you need for a damaged item?', 'The lid of the case is cracked.', 'Please send photos of the item and the box.'],
  ['100006', 'How quickly do you replace damaged items?', 'Need the tablet for work.', 'We ship a replacement within 2 business days at no cost.'],
  ['100006', 'Do I send back a damaged $20 cable?', 'The connector is bent.', 'No, you do not need to return a damaged item worth under $30.'],
  ['100006', 'Tablet screen cracked out of the box', 'Opened it this morning.', 'We will ship a replacement within 2 business days or refund you in full. Please send photos within 48 hours of delivery.'],
  ['100006', 'Refund instead of replacement for damage?', 'I would rather have my money back.', 'Yes, we can refund you in full instead of sending a replacement.'],
  ['100006', 'Found damage 5 days after delivery', 'Only unpacked it now.', 'Damage has to be reported within 48 hours of delivery.'],
];

// Agent forgot to paste a link. First 6 are linkable by fact, last 4 are not.
export const NO_LINK = [
  ['How many days to return a mouse?', 'Bought it online.', 'You have 30 days from delivery.'],
  ['Extended warranty price?', 'For the soundbar.', 'It is $49 for 3 extra years.'],
  ['Next day delivery possible?', 'Need it tomorrow.', 'Express arrives in 1 business day for $12.'],
  ['Cancel fee after 4 hours?', 'Still not shipped.', 'There is a $5 fee if it has not shipped.'],
  ['PayPal refund time', 'Returned headphones.', 'Within 24 hours.'],
  ['Damaged item reporting deadline', 'Box dented.', 'Within 48 hours of delivery.'],
  ['Do you have a store in Berlin?', 'Want to see the speakers in person.', 'We are online only at the moment.'],
  ['Can I change the delivery address?', 'Moving flats next week.', 'Yes, reply with the new address before the order ships.'],
  ['Is the X200 compatible with iPhone?', 'Before I buy.', 'Yes, it works with any Bluetooth device.'],
  ['Do you sell refurbished items?', 'Looking for a cheaper laptop.', 'Not yet, but we are planning to.'],
];

// Must never reach the golden set. kind: reopened | complaint | low_csat
export const BAD = [
  ['reopened', '100001', 'Return label not received', 'Asked for a return 2 days ago.', 'Returns are free, we email you a prepaid return label.'],
  ['reopened', '100001', 'Can I return headphones after 20 days?', 'Opened but faulty.', 'You have 30 days from delivery to return it.'],
  ['reopened', '100002', 'Warranty claim for a dead power bank', 'It will not charge.', 'Send us the serial number and a short video of the problem.'],
  ['reopened', '100003', 'Order stuck in transit', 'It has been a week.', 'Standard delivery takes 4 business days.'],
  ['reopened', '100004', 'Cancel order placed this morning', 'It is not needed anymore.', 'You can cancel free of charge within 2 hours of placing the order.'],
  ['reopened', '100005', 'Refund missing after two weeks', 'Still nothing on my card.', 'Card refunds appear on your statement within 3 business days after we issue them.'],
  ['reopened', '100006', 'Replacement never arrived', 'Reported damage last week.', 'We ship a replacement within 2 business days at no cost.'],
  ['reopened', '100001', 'Return window for a gaming chair', 'Arrived 10 days ago.', 'Most items can be returned within 30 days of delivery.'],
  ['complaint', '100001', 'Prepaid label does not open', 'The link in the email is broken.', 'Returns are free: we email you a prepaid return label.'],
  ['complaint', '100003', 'Express order did not come next day', 'I paid for express.', 'Express delivery arrives in 1 business day and costs $12.'],
  ['complaint', '100005', 'Store credit bonus not applied', 'I got only the base amount.', 'We can issue store credit with a 10% bonus.'],
  ['complaint', '100002', 'Warranty repair taking too long', 'Waiting for three weeks.', 'Approved claims are repaired or replaced within 15 business days.'],
  ['low_csat', '100004', 'Charged after cancelling', 'I cancelled within the hour.', 'After 2 hours, if the order has not shipped, we charge a $5 handling fee.'],
  ['low_csat', '100006', 'Broken screen, want a refund', 'Photos attached.', 'We ship a replacement within 2 business days at no cost.'],
  ['low_csat', '100001', 'Restocking fee on a sealed tablet', 'It was never opened.', 'Opened laptops and tablets have a 15% restocking fee.'],
];

// Near-copies of golden questions (index into GOLDEN). Dedupe must drop them.
export const DUPLICATE_OF = [21, 13, 29, 38, 44];
