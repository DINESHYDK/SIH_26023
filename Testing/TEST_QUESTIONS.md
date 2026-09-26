# Test questions with expected answers

Public documents from the Ministry of Coal, CMPDI and DGMS. Every expected answer
was checked against the PDF text. MT = million tonnes.

Start with `chap9AnnualReport2025en2.pdf`, `msg-march25.pdf` and
`dgmscircular3_27082024.pdf`: small, and together they cover typed text,
tables and a scanned PDF.

## chap9AnnualReport2025en2.pdf — MoC Annual Report 2024-25, Ch. 9 (8 pages, tables)
Source: https://coal.gov.in/sites/default/files/2025-02/chap9AnnualReport2025en2.pdf

| Question | Expected answer |
|---|---|
| What was India's all-India coal production in FY 2023-24? | 997.83 MT, up ~11.72% from 893.19 MT in 2022-23 |
| Which CIL subsidiary produced the most coal in 2023-24? | MCL, 206.10 MT (target 204.00) |
| How much coal did India import in 2023-24? | 264.53 MT (58.81 coking + 205.72 non-coking), +9.82% |
| What is the estimated total coal demand for 2024-25? | 1376.56 MT (Power utility 808.45 MT) |
| What was CIL's opencast output per manshift in 2023-24? | 25.57 t (UG 1.18, overall 13.44) |
| Tricky: What is the coal PSU CAPEX for FY 2024-25? | Text says ₹24,490 crore, but the table shows BE ₹19,529 cr / RE ₹22,048.86 cr. A good answer notes the mismatch |

## msg-march25.pdf — Monthly Coal Statistics, March 2025 (23 pages)
Source: https://coal.gov.in/sites/default/files/2025-04/msg-march25.pdf

| Question | Expected answer |
|---|---|
| What was India's total coal production in FY 2024-25? | 1047.68 MT, +5.00% over 997.83 MT |
| What was CIL's production in FY 2024-25? | 781.08 MT, +0.96% |
| Which subsidiaries saw production decline in FY25? | SECL 167.50 MT (−10.61%), BCCL 40.50 MT (−1.45%); SCCL 69.01 MT (−1.45%) |
| How did captive/other mines perform in FY25? | 197.60 MT, +28.18% |
| What was coal production in March 2025 alone? | 118.54 MT, +1.59% vs Mar 2024 |

## dgmscircular3_27082024.pdf — DGMS Circular 03/2024 (SCANNED, 4 pages → Gemini OCR)
Source: https://www.dgms.gov.in/writereaddata/UploadFile/dgmscircular3_27082024.pdf

| Question | Expected answer |
|---|---|
| What share of 2023 fatal accidents involved dumpers/tippers? | 36% |
| Break down those accidents by cause | Run-overs 46%, hit by dumpers 23%, head-on collisions 15%, toppling 8%, other 8% |
| How many accident cases does the circular describe? | 10 |
| Which regulation covers fail-safe brakes on tippers? | G.S.R. 987(E) dated 1 Oct 2018, under Reg. 216(2) of Coal Mines Regulations 2017 |

## Pib27dec.pdf — MoC Year End Review 2024 (18 pages, prose)
Source: https://coal.nic.in/sites/default/files/2025-01/Pib27dec.pdf

| Question | Expected answer |
|---|---|
| Coal production in calendar 2024 up to 15 Dec? | ~988.32 MT vs 918.02 MT, +7.66% |
| What is Mission Coking Coal's target? | 140 MT raw coking coal by FY 2029-30 (FY24 actual 66.821 MT; FY25 target 77 MT) |
| How many coking coal blocks were auctioned to the private sector? | 14, expected to produce by 2028-29 |
| How many appointment letters under Mission Mode Recruitment? | 13,341 (CIL 9,384; NLCIL 3,957) |

## 15-09-2025b-auct.pdf — CMPDI auction presentation, 13th/23rd tranche (slides)
Source: https://www.coal.nic.in/sites/default/files/2025-09/15-09-2025b-auct.pdf

| Question | Expected answer |
|---|---|
| How many coal blocks are in this tranche? | 14 (4 CM(SP), 10 MMDR) across 5 states |
| Total geological resources and PRC? | 8854.92 Mt; PRC 60.16 Mty |
| Which block has the largest resources? | Recherla, Godavari Valley, Andhra Pradesh, 2225.56 Mt |
| Which block has the highest peak rated capacity? | Pirpainti Barahat, Rajmahal, Jharkhand, 25 Mty |

## MARWATOLA_I&II_G2.pdf — CMPDI Geological Report (254 pages — slow, stress test)
Source: https://nmet.gov.in/upload/uploadfiles/files/MARWATOLA_I&II_G2.pdf

| Question | Expected answer |
|---|---|
| Total resources of the block? | 197.767 Mt gross indicated; UNFC code 332 |
| Which seam has the largest resources? | Seam IB, 34.772 Mt |

## Multi-document questions

| Docs | Question | Expected answer |
|---|---|---|
| chap9 + msg-march25 | How did MCL's production change from FY24 to FY25? | ~206.1 MT → 225.17 MT, +9.26% |
| chap9 + msg-march25 | Compare all-India production FY23 → FY24 → FY25 | 893.19 → 997.83 → 1047.68 MT |
| auct + MARWATOLA | What resources does Marwatola have? | Deck: Marwatola I only, 51.59 Mt. Report: Sectors I & II, 197.767 Mt. A good answer notes the different scope |

## Should answer "not found" (hallucination check)

- What was Coal India's net profit in FY 2024-25?
- How many workers died in coal mines in 2023? (the circular gives only percentages)
