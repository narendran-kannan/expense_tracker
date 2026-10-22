/**
 * Labelled evaluation set for the expense-tracker categorisation prompt.
 *
 * Each case mimics a real HDFC / IDFC FIRST debit-alert email. `expect` holds the
 * primary label (used for strict accuracy) plus any other defensible label
 * (used for lenient accuracy) so genuinely ambiguous merchants are not penalised.
 *
 * `junk: true` means the model MUST return confidence_score 0 (credit alert,
 * OTP, marketing, statement, balance update).
 */
export interface Case {
  id: string;
  from: string;
  subject: string;
  body: string;
  expect: {
    junk?: true;
    category?: string;
    subcategory?: string | null;
    /** other categories that are defensible */
    altCategories?: string[];
    is_cc_payment?: boolean;
    amount?: number;
    merchant?: RegExp;
    /** resolved transaction date (YYYY-MM-DD UTC) */
    date?: string;
  };
}

export const CASES: Case[] = [
  // ---------- Food & Dining ----------
  {
    id: "food-swiggy",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Dear Customer, Rs.450.00 has been debited from account 1234 to VPA swiggy@axisbank on 20-10-26. Your UPI reference number is 1478523690.",
    expect: { category: "Food & Dining", subcategory: "Delivery", amount: 450, merchant: /swiggy/i, date: "2026-10-20" },
  },
  {
    id: "food-zomato",
    from: "alerts@hdfcbank.bank.in",
    subject: "UPI debit",
    body: "Rs.318.50 debited from HDFC Bank A/c XX4321 to ZOMATO LIMITED on 18-10-26 via UPI.",
    expect: { category: "Food & Dining", subcategory: "Delivery", amount: 318.5, merchant: /zomato/i, date: "2026-10-18" },
  },
  {
    id: "food-third-wave",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 780.00 spent at THIRD WAVE COFFEE, INDIRANAGAR on 19-10-2026 using IDFC FIRST Bank Debit Card XX9012.",
    expect: { category: "Food & Dining", subcategory: "Cafe", amount: 780, merchant: /third wave/i, date: "2026-10-19" },
  },
  {
    id: "food-street-shawarma",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.160.00 debited from A/c XX1234 at AL TAZEEM SHAWARMA on 17-10-26.",
    expect: { category: "Food & Dining", subcategory: "Street Food", amount: 160, merchant: /tazeem/i, date: "2026-10-17" },
  },

  // ---------- Groceries ----------
  {
    id: "groc-zepto",
    from: "alerts@hdfcbank.bank.in",
    subject: "Debit alert",
    body: "Rs.1,248.00 has been debited from account 1234 to VPA zeptomarketplace@ybl on 21-10-26. UPI Ref 4471258963.",
    expect: { category: "Groceries", subcategory: "Supermarket", altCategories: ["Food & Dining"], amount: 1248, merchant: /zepto/i, date: "2026-10-21" },
  },
  {
    id: "groc-local-vegetables",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 240.00 spent at SRI VENKATESWARA VEGETABLE STALL on 20-10-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Groceries", subcategory: "Vegetables", amount: 240, merchant: /venkateswara|vegetable/i, date: "2026-10-20" },
  },
  {
    id: "groc-amul-milk",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.68.00 debited from A/c XX1234 to VPA amul milk dairy@ybl on 21-10-26.",
    expect: { category: "Groceries", subcategory: "Dairy", altCategories: ["Food & Dining"], amount: 68, merchant: /amul/i, date: "2026-10-21" },
  },
  {
    id: "groc-licious",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.612.00 debited from A/c XX1234 to VPA licious@axb on 16-10-26. UPI Ref 9988776655.",
    expect: { category: "Groceries", subcategory: "Meat", altCategories: ["Food & Dining"], amount: 612, merchant: /licious/i, date: "2026-10-16" },
  },

  // ---------- Transportation ----------
  {
    id: "trans-uber",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.287.00 debited from A/c XX1234 to VPA uber@axisbank on 19-10-26. UPI Ref 1122334455.",
    expect: { category: "Transportation", subcategory: "Cab", amount: 287, merchant: /uber/i, date: "2026-10-19" },
  },
  {
    id: "trans-auto",
    from: "alerts@hdfcbank.net",
    subject: "UPI debit alert",
    body: "Rs.90.00 debited from A/c XX1234 to VPA ravi.auto@okicici on 21-10-26 (Namma auto ride).",
    expect: { category: "Transportation", subcategory: "Auto", amount: 90, merchant: /ravi|auto/i, date: "2026-10-21" },
  },
  {
    id: "trans-metro",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 150.00 spent at BMRCL NAMMA METRO RECHARGE on 15-10-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Transportation", subcategory: "Metro", amount: 150, merchant: /metro|bmrcl/i, date: "2026-10-15" },
  },
  {
    id: "trans-iocl-fuel",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.2,500.00 debited from A/c XX1234 at IOCL FUEL STATION, HSR LAYOUT on 14-10-26 using Debit Card.",
    expect: { category: "Transportation", subcategory: "Fuel", amount: 2500, merchant: /iocl/i, date: "2026-10-14" },
  },
  {
    id: "trans-fastag-toll",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 275.00 spent at NHAI FASTAG TOLL PLAZA on 13-10-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Transportation", subcategory: "Toll", amount: 275, merchant: /fastag|nhai|toll/i, date: "2026-10-13" },
  },
  {
    id: "trans-parking",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.60.00 debited from A/c XX1234 to VPA parkplus@ybl on 20-10-26. UPI Ref 5566778899.",
    expect: { category: "Transportation", subcategory: "Parking", altCategories: ["Other"], amount: 60, merchant: /park/i, date: "2026-10-20" },
  },

  // ---------- Travel ----------
  {
    id: "travel-indigo",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.7,420.00 debited from A/c XX1234 at INDIGO AIRLINES on 12-10-26 using Debit Card XX5678.",
    expect: { category: "Travel", subcategory: "Flights", amount: 7420, merchant: /indigo/i, date: "2026-10-12" },
  },
  {
    id: "travel-irctc",
    from: "alerts@hdfcbank.bank.in",
    subject: "Debit alert",
    body: "Rs.1,845.00 debited from A/c XX1234 to IRCTC on 11-10-26 via UPI. Ref 3344556677.",
    expect: { category: "Travel", subcategory: "Trains", altCategories: ["Transportation"], amount: 1845, merchant: /irctc/i, date: "2026-10-11" },
  },
  {
    id: "travel-makemytrip-hotel",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 3,190.00 spent at MAKE MY TRIP - HOTEL on 10-10-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Travel", subcategory: "Hotels", amount: 3190, merchant: /make ?my ?trip/i, date: "2026-10-10" },
  },
  {
    id: "travel-redbus",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.1,150.00 debited from A/c XX1234 to VPA redbus@axisbank on 09-10-26. UPI Ref 5566112233.",
    expect: { category: "Travel", subcategory: "Buses", altCategories: ["Transportation"], amount: 1150, merchant: /redbus/i, date: "2026-10-09" },
  },

  // ---------- Shopping ----------
  {
    id: "shop-amazon-clothing",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.1,899.00 debited from A/c XX1234 at AMAZON INDIA on 20-10-26. ",
    expect: { category: "Shopping", altCategories: [], amount: 1899, merchant: /amazon/i, date: "2026-10-20" },
  },
  {
    id: "shop-croma-laptop",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.68,990.00 debited from A/c XX1234 at CROMA ELECTRONICS on 08-10-26 using Debit Card XX5678.",
    expect: { category: "Shopping", subcategory: "Electronics", amount: 68990, merchant: /croma/i, date: "2026-10-08" },
  },
  {
    id: "shop-ikea",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 12,450.00 spent at IKEA INDIA on 07-10-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Shopping", subcategory: "Home & Kitchen", amount: 12450, merchant: /ikea/i, date: "2026-10-07" },
  },
  {
    id: "shop-nike",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.4,299.00 debited from A/c XX1234 to VPA nike retail@ybl on 06-10-26.",
    expect: { category: "Shopping", subcategory: "Clothing", altCategories: ["Health & Fitness"], amount: 4299, merchant: /nike/i, date: "2026-10-06" },
  },
  {
    id: "shop-nykaa",
    from: "alerts@hdfcbank.bank.in",
    subject: "Debit alert",
    body: "Rs.1,120.00 debited from A/c XX1234 to NYKAA E-COMMERCE on 05-10-26 via UPI.",
    expect: { category: "Shopping", subcategory: "Personal Care", amount: 1120, merchant: /nykaa/i, date: "2026-10-05" },
  },

  // ---------- Bills & Utilities ----------
  {
    id: "bills-bescom",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.1,340.00 debited from A/c XX1234 to VPA bescom billdesk@ybl on 04-10-26. Electricity bill payment.",
    expect: { category: "Bills & Utilities", subcategory: "Electricity", amount: 1340, merchant: /bescom|electricity/i, date: "2026-10-04" },
  },
  {
    id: "bills-act-fibernet",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 1,099.00 spent at ACT FIBERNET BROADBAND on 03-10-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Bills & Utilities", subcategory: "Internet", amount: 1099, merchant: /act ?fibernet/i, date: "2026-10-03" },
  },
  {
    id: "bills-jio-recharge",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.359.00 debited from A/c XX1234 to VPA jio prepaid recharge@ybl on 02-10-26.",
    expect: { category: "Bills & Utilities", subcategory: "Mobile Recharge", altCategories: ["Bills & Utilities"], amount: 359, merchant: /jio/i, date: "2026-10-02" },
  },
  {
    id: "bills-tataplay-dth",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.299.00 debited from A/c XX1234 to TATA PLAY DTH on 01-10-26.",
    expect: { category: "Bills & Utilities", subcategory: "DTH", altCategories: ["Entertainment"], amount: 299, merchant: /tata ?play/i, date: "2026-10-01" },
  },
  {
    id: "bills-rent",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.28,000.00 debited from A/c XX1234 to VPA landlord.suresh@okhdfcbank on 01-10-26 (house rent October).",
    expect: { category: "Bills & Utilities", subcategory: "Rent", altCategories: ["Transfer"], amount: 28000, merchant: /suresh|landlord/i, date: "2026-10-01" },
  },
  {
    id: "bills-indane-gas",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.905.00 debited from A/c XX1234 to VPA indane gas@ybl on 30-09-26.",
    expect: { category: "Bills & Utilities", subcategory: "Gas", amount: 905, merchant: /indane/i, date: "2026-09-30" },
  },

  // ---------- Entertainment ----------
  {
    id: "ent-netflix",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.649.00 debited from A/c XX1234 to NETFLIX ENTERTAINMENT on 28-09-26. Auto-debit mandate.",
    expect: { category: "Entertainment", subcategory: "Streaming", amount: 649, merchant: /netflix/i, date: "2026-09-28" },
  },
  {
    id: "ent-pvr",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 760.00 spent at PVR CINEMAS on 27-09-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Entertainment", subcategory: "Movies", amount: 760, merchant: /pvr/i, date: "2026-09-27" },
  },
  {
    id: "ent-playstation",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.4,999.00 debited from A/c XX1234 at SONY PLAYSTATION on 26-09-26.",
    expect: { category: "Entertainment", subcategory: "Gaming", altCategories: ["Shopping"], amount: 4999, merchant: /playstation/i, date: "2026-09-26" },
  },
  {
    id: "ent-bookmyshow",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.2,400.00 debited from A/c XX1234 to BIG TREE - BOOKMYSHOW on 25-09-26 (concert tickets).",
    expect: { category: "Entertainment", subcategory: "Events", altCategories: ["Entertainment"], amount: 2400, merchant: /bookmyshow|big ?tree/i, date: "2026-09-25" },
  },

  // ---------- Health & Fitness ----------
  {
    id: "health-cultfit",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.1,499.00 debited from A/c XX1234 to CULTFIT on 24-09-26. Gym membership.",
    expect: { category: "Health & Fitness", subcategory: "Gym", amount: 1499, merchant: /cult/i, date: "2026-09-24" },
  },
  {
    id: "health-apollo-pharmacy",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 432.00 spent at APOLLO PHARMACY on 23-09-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Health & Fitness", subcategory: "Medicine", amount: 432, merchant: /apollo/i, date: "2026-09-23" },
  },
  {
    id: "health-practo",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.800.00 debited from A/c XX1234 to VPA practo healthcare@ybl on 22-09-26 (doctor consultation).",
    expect: { category: "Health & Fitness", subcategory: "Doctor", amount: 800, merchant: /practo/i, date: "2026-09-22" },
  },
  {
    id: "health-thyrocare",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.1,850.00 debited from A/c XX1234 to THYROCARE LAB on 21-09-26.",
    expect: { category: "Health & Fitness", subcategory: "Lab Tests", amount: 1850, merchant: /thyrocare/i, date: "2026-09-21" },
  },
  {
    id: "health-decathlon",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 3,240.00 spent at DECATHLON SPORTS on 20-09-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Health & Fitness", subcategory: "Sports", altCategories: ["Shopping"], amount: 3240, merchant: /decathlon/i, date: "2026-09-20" },
  },

  // ---------- Insurance ----------
  {
    id: "ins-lic",
    from: "nachautoemailer@hdfcbank.bank.in",
    subject: "NACH auto debit",
    body: "Rs.3,450.00 debited from your account XX1234 towards LIC OF INDIA PREMIUM with UMRN HDFC0000123456 on 19-09-26.",
    expect: { category: "Insurance", subcategory: "Life", amount: 3450, merchant: /lic/i, date: "2026-09-19" },
  },
  {
    id: "ins-star-health",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 8,100.00 spent at STAR HEALTH INSURANCE on 18-09-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Insurance", subcategory: "Health", amount: 8100, merchant: /star health/i, date: "2026-09-18" },
  },
  {
    id: "ins-bajaj-allianz-vehicle",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.5,220.00 debited from A/c XX1234 to VPA bajaj allianz two wheeler@ybl on 17-09-26.",
    expect: { category: "Insurance", subcategory: "Vehicle", amount: 5220, merchant: /bajaj/i, date: "2026-09-17" },
  },

  // ---------- Savings & Investments ----------
  {
    id: "inv-groww",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.10,000.00 debited from A/c XX1234 to VPA groww investments@ybl on 16-09-26.",
    expect: { category: "Savings & Investments", subcategory: "Mutual Funds", altCategories: ["Savings & Investments"], amount: 10000, merchant: /groww/i, date: "2026-09-16" },
  },
  {
    id: "inv-zerodha",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.15,000.00 debited from A/c XX1234 to ZERODHA BROKING on 15-09-26. Fund transfer for trading.",
    expect: { category: "Savings & Investments", subcategory: "Equity", amount: 15000, merchant: /zerodha/i, date: "2026-09-15" },
  },
  {
    id: "inv-sip",
    from: "nachautoemailer@hdfcbank.bank.in",
    subject: "NACH auto debit",
    body: "Rs.5,000.00 debited from your account XX1234 towards HDFC AMC SIP with UMRN HDFC0000987654 on 14-09-26.",
    expect: { category: "Savings & Investments", subcategory: "Mutual Funds", amount: 5000, merchant: /hdfc ?amc|sip/i, date: "2026-09-14" },
  },
  {
    id: "inv-ppf",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 50,000.00 spent at SBI PPF ACCOUNT CONTRIBUTION on 13-09-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Savings & Investments", subcategory: "PPF", amount: 50000, merchant: /ppf|sbi/i, date: "2026-09-13" },
  },
  {
    id: "inv-gold-etf",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.2,000.00 debited from A/c XX1234 to VPA nse gold etf@ybl on 12-09-26.",
    expect: { category: "Savings & Investments", subcategory: "Gold", altCategories: ["Savings & Investments"], amount: 2000, merchant: /gold/i, date: "2026-09-12" },
  },

  // ---------- Transfer ----------
  {
    id: "transfer-friend",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.2,000.00 debited from A/c XX1234 to VPA arjun.mehta@okaxis on 11-09-26. UPI Ref 7788990011.",
    expect: { category: "Transfer", subcategory: "Friends", amount: 2000, merchant: /arjun/i, date: "2026-09-11" },
  },
  {
    id: "transfer-family",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.15,000.00 debited from A/c XX1234 to VPA lakshmi.mother@ybl on 10-09-26 (money for home).",
    expect: { category: "Transfer", subcategory: "Family", amount: 15000, merchant: /lakshmi/i, date: "2026-09-10" },
  },
  {
    id: "transfer-self",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.20,000.00 debited from A/c XX1234 to own account XX9876 (ICICI Bank) on 09-09-26 via IMPS. Ref 9900112233.",
    expect: { category: "Transfer", subcategory: "Self", amount: 20000, merchant: /own|self|icici/i, date: "2026-09-09" },
  },

  // ---------- ATM / Credit Card ----------
  {
    id: "atm-hdfc",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.5,000.00 withdrawn from A/c XX1234 at HDFC BANK ATM, KORAMANGALA on 08-09-26. Available balance Rs.24,311.00.",
    expect: { category: "ATM Withdrawal", subcategory: null, amount: 5000, merchant: /hdfc|atm/i, date: "2026-09-08" },
  },
  {
    id: "cc-sbi-card-payment",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.23,456.00 debited from A/c XX1234 to SBICARD PAYMENT on 07-09-26 via NEFT. Credit card bill payment.",
    expect: { category: "Credit Card Payment", is_cc_payment: true, amount: 23456, merchant: /sbi ?card/i, date: "2026-09-07" },
  },
  {
    id: "cc-amex-bill",
    from: "noreply@idfcfirstbank.com",
    subject: "Transaction alert",
    body: "INR 18,900.00 spent at AMERICAN EXPRESS CARD PAYMENT on 06-09-26 using IDFC FIRST Bank Debit Card.",
    expect: { category: "Credit Card Payment", is_cc_payment: true, amount: 18900, merchant: /american express|amex/i, date: "2026-09-06" },
  },

  // ---------- Education ----------
  {
    id: "edu-coursera",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.3,999.00 debited from A/c XX1234 to VPA coursera inc@ybl on 05-09-26.",
    expect: { category: "Education", subcategory: "Courses", amount: 3999, merchant: /coursera/i, date: "2026-09-05" },
  },
  {
    id: "edu-kindle-books",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.499.00 debited from A/c XX1234 at AMAZON KINDLE BOOKS on 04-09-26.",
    expect: { category: "Education", subcategory: "Books", altCategories: ["Entertainment", "Shopping"], amount: 499, merchant: /kindle/i, date: "2026-09-04" },
  },
  {
    id: "edu-school-fees",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.42,000.00 debited from A/c XX1234 to VPA dpsi school fees@ybl on 03-09-26 (term 2 tuition).",
    expect: { category: "Education", subcategory: "Tuition", amount: 42000, merchant: /school/i, date: "2026-09-03" },
  },

  // ---------- Other (EMI, misc) ----------
  {
    id: "other-bajaj-emi",
    from: "nachautoemailer@hdfcbank.bank.in",
    subject: "NACH auto debit",
    body: "Rs.4,120.00 debited from your account XX1234 towards BAJAJ FINANCE EMI with UMRN HDFC0000777123 on 02-09-26.",
    expect: { category: "Other", altCategories: ["Bills & Utilities", "Shopping"], amount: 4120, merchant: /bajaj/i, date: "2026-09-02" },
  },
  {
    id: "other-donations",
    from: "alerts@hdfcbank.net",
    subject: "Debit Alert",
    body: "Rs.1,000.00 debited from A/c XX1234 to VPA give india@ybl on 01-09-26.",
    expect: { category: "Other", altCategories: ["Transfer"], amount: 1000, merchant: /give/i, date: "2026-09-01" },
  },

  // ---------- Junk (must be confidence_score 0) ----------
  {
    id: "junk-credit-alert",
    from: "alerts@hdfcbank.net",
    subject: "Credit Alert",
    body: "Dear Customer, Rs.5,000.00 has been credited to your account XX1234 on 20-10-26 by NEFT from RAHUL SHARMA. Ref 123456.",
    expect: { junk: true },
  },
  {
    id: "junk-otp",
    from: "alerts@hdfcbank.net",
    subject: "One Time Password",
    body: "Your OTP for the transaction of Rs.450.00 is 482913. Do not share this OTP with anyone.",
    expect: { junk: true },
  },
  {
    id: "junk-marketing",
    from: "noreply@idfcfirstbank.com",
    subject: "Pre-approved personal loan up to Rs. 15 lakh!",
    body: "Congratulations! You are pre-approved for a personal loan of up to Rs.15,00,000 at a special interest rate. Apply now and get instant disbursal.",
    expect: { junk: true },
  },
  {
    id: "junk-statement",
    from: "alerts@hdfcbank.bank.in",
    subject: "Your monthly e-statement is ready",
    body: "Your account statement for the period 01-09-2026 to 30-09-2026 is ready. Total debits: Rs.42,300.00. Total credits: Rs.60,000.00.",
    expect: { junk: true },
  },
  {
    id: "junk-balance-update",
    from: "alerts@hdfcbank.net",
    subject: "Balance update",
    body: "Your available balance in A/c XX1234 is Rs.18,745.23 as on 21-10-26.",
    expect: { junk: true },
  },
];

export function buildEmailText(c: Case): string {
  return `From: ${c.from}\nSubject: ${c.subject}\n\n${c.body}`;
}
