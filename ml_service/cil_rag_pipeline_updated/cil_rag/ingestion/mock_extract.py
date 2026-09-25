"""
Offline stand-in for vision_extract.extract_page(), used to build and test the
rest of the pipeline without a live Gemini call (this sandbox has no network
access to Google's API). The content below is transcribed by hand from the
actual page images -- it's what extract_page() SHOULD return once run for
real with a GEMINI_API_KEY. Swap mock_extract_page for extract_page in
ingest_pipeline.py once you have a key.
"""
from ingestion.vision_extract import ExtractedPage, ExtractedTable


def mock_extract_page(image_path: str, page_number: int) -> ExtractedPage:
    if page_number == 2:
        return ExtractedPage(
            page_number=2,
            section_heading="Annex-I: Brief about Coal India Limited",
            narrative_text=(
                "Purpose for which CPSE has been setup: To produce and market the "
                "planned quantity of coal and coal products efficiently and "
                "economically in an eco-friendly manner with due regard to safety, "
                "conservation and quality. Status: Maharatna. An addition of 53.12 MT "
                "of coal production is proposed in 2019-20 against the production of "
                "606.88 Mt in 2018-19. Production of 29 mines suspended during "
                "2018-19 (till Feb'19) & 5 new mines are likely to start contribution "
                "during 2019-20. Major chunk of CIL production is power grade coal; "
                "CIL's despatch to power house during 2017-18 was about 456 Mt and "
                "during 2018-19 was 488 MT. CIL is under administrative control of "
                "Ministry of Coal, Govt. of India."
            ),
            tables=[
                ExtractedTable(
                    table_id="annex_i_cpse_brief",
                    caption="Brief about (Coal India Limited)",
                    columns=["Item", "Detail"],
                    rows=[
                        {"Item": "Name of the CPSE", "Detail": "Coal India Limited"},
                        {"Item": "Status", "Detail": "Maharatna"},
                        {"Item": "Share price NSE (10.05.2019)", "Detail": "241.25"},
                        {"Item": "Share price BSE (10.05.2019)", "Detail": "241.55"},
                        {"Item": "% of PAT given as dividend (FY2017-18)", "Detail": "145.90%"},
                    ],
                    notes=None,
                )
            ],
        )
    elif page_number == 3:
        return ExtractedPage(
            page_number=3,
            section_heading="Annex-II: Mandatory Parameters, Part A, Coal India Limited",
            narrative_text="Best in last 5 years is prior to and excluding FY 2018-19.",
            tables=[
                ExtractedTable(
                    table_id="annex_ii_part_a",
                    caption="Mandatory Parameters Part A - Coal India Limited",
                    columns=[
                        "Financial Performance Criteria", "Unit", "Marks", "2018-19 (RE)",
                        "Best in Last 5 years", "MoU Target - Excellent", "MoU Target - V.G.",
                        "MoU Target - Good", "MoU Target - Fair", "MoU Target - Poor",
                        "Improvement (%)",
                    ],
                    rows=[
                        {
                            "Financial Performance Criteria": "Turnover - Revenue from Operations (Net)",
                            "Unit": "Rs. crore", "Marks": "10", "2018-19 (RE)": "92000",
                            "Best in Last 5 years": "85862 (2017-18)",
                            "MoU Target - Excellent": "100000", "MoU Target - V.G.": "95000",
                            "MoU Target - Good": "90000", "MoU Target - Fair": "85000",
                            "MoU Target - Poor": "80000", "Improvement (%)": "3.26",
                        },
                        {
                            "Financial Performance Criteria": "Operating Profit as % of Revenue from Operations (net)",
                            "Unit": "%", "Marks": "20", "2018-19 (RE)": "15.00",
                            "Best in Last 5 years": "22.25 (2013-14)",
                            "MoU Target - Excellent": "17.5", "MoU Target - V.G.": "15.50",
                            "MoU Target - Good": "14.50", "MoU Target - Fair": "14.00",
                            "MoU Target - Poor": "13.50", "Improvement (%)": "3.33",
                        },
                        {
                            "Financial Performance Criteria": "Return on investment - PAT / Average Net Worth",
                            "Unit": "%", "Marks": "20", "2018-19 (RE)": "58.15",
                            "Best in Last 5 years": "38.46 (2015-16)",
                            "MoU Target - Excellent": "68", "MoU Target - V.G.": "65",
                            "MoU Target - Good": "63", "MoU Target - Fair": "62",
                            "MoU Target - Poor": "61", "Improvement (%)": "11.78",
                        },
                    ],
                    notes="Best in last 5 years is prior to and excluding FY 2018-19.",
                )
            ],
        )
    elif page_number == 18:
        return ExtractedPage(
            page_number=18,
            section_heading="Milestones of MoSPI Monitored Projects for MoU 2019-20 (MoU Parameters)",
            narrative_text="",
            tables=[
                ExtractedTable(
                    table_id="mospi_milestones_p1",
                    caption="Milestones of MoSPI Monitored Projects for MoU 2019-20",
                    columns=["Subsidiary", "Project", "Capacity (Mty)", "Milestone", "Total Sanctioned Capital (Rs Crs)", "Timeline for Completion"],
                    rows=[
                        {"Subsidiary": "WCL", "Project": "Penganga OC", "Capacity (Mty)": "4.00",
                         "Milestone": "Vacation of 100 houses of Wirur village under R&R activity",
                         "Total Sanctioned Capital (Rs Crs)": "441.82", "Timeline for Completion": "Mar-20"},
                        {"Subsidiary": "WCL", "Project": "Dinesh OC", "Capacity (Mty)": "4.00",
                         "Milestone": "Achieving Production target of 3.5MTPA",
                         "Total Sanctioned Capital (Rs Crs)": "611.16", "Timeline for Completion": "Mar-20"},
                        {"Subsidiary": "WCL", "Project": "Singhori OC", "Capacity (Mty)": "0.85",
                         "Milestone": "Submission of Form I for expansion in production capacity by 40% i.e. from 0.80 MTPA to 1.12 MTPA",
                         "Total Sanctioned Capital (Rs Crs)": "205.49", "Timeline for Completion": "Jan-20"},
                    ],
                    notes=None,
                )
            ],
        )
    raise ValueError(f"No mock content authored for page {page_number}")
