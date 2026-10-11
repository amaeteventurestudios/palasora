"""Naming data for v1.7 resident personas (docs/specs/30 §3, 33).

Fictional personas get plausible, locally common names so the network reads as African rather than as handle soup.
A name is a presentation choice, NOT a claim of ethnicity, residence, religion or nationality, and every persona is
labelled "Palavva Resident AI" with a fictional-affiliation bio.

Sources: common given names and surnames as listed in public civil-registration name-frequency summaries, national
name dictionaries and Wikipedia name lists for each country (individual names are facts, not protected expression).
Lists were assembled by hand for this repository, see docs/evidence/v17/DECISIONS.md D-V17-04.

Impersonation guard: surnames strongly tied to a single famous person (heads of state, laureates, global stars) are
left out of the lists, and FAMOUS blocks the exact full name of well-known public figures in case a common given name
and a common surname still combine into one.

Zones are linguistic/naming areas, not ethnic labels; a persona's zone comes from its ADM1 region (with a share of
mixing, because cities are mixed), and religion is never used or inferred.
"""
from __future__ import annotations


def _s(text: str) -> list[str]:
    return [w.replace("_", " ") for w in text.split()]


# zone: (female given, male given, surnames). Underscore = space inside one name.
ZONES: dict[str, tuple[list[str], list[str], list[str]]] = {
    # ---------------------------------------------------------------- West Africa
    "ng_yo": (_s("Adebola Adenike Abimbola Bukola Funmilayo Folake Ibukun Iyabo Kemi Modupe Morenike Omolara Oluwaseun Ronke Simisola Temitope Titilayo  Yetunde Damilola Ayomide Eniola Opeyemi Toluwani Oyinkansola Feyisayo Adeola Bolanle Mosunmola"),
              _s("Adebayo Ademola Babatunde Femi Gbenga Kayode Kunle Olumide Segun Tunde Wale Yinka Dapo Bayo Akin Lekan Seun Tobi Ayodele Olawale Damola  Kolawole Oluwafemi Adewale Sola Niyi Rotimi Tayo"),
              _s("Adeyemi Ogunleye Olawale Akinola Balogun Oladipo Ogunbiyi Oyelaran Ajayi Akande Ogundipe Oyewole Afolabi Odukoya Olatunji Ojo Oni Bamidele  Adegoke Alabi Aderinto Olaniyan Abiodun Oladele Okunola Fagbemi Adeniran Oyebanji")),
    "ng_ig": (_s("Adaeze Amaka Chiamaka Chidinma Chioma Ebele Ifeoma Ijeoma Ngozi Nkechi Obiageli Ugochi Uju Nneka Oluchi Chinwe Somtochukwu Ozioma Adanna  Chinyere Onyinye Ogechi Amarachi Nkiru Chidera Ifunanya Ebere Kosiso"),
              _s("Chukwuemeka Chinedu Ikenna Obinna Uchenna Emeka Nnamdi Chidi Kelechi Ifeanyi Obiora Tochukwu Chibuike Ebuka Kenechukwu Okechukwu Nonso  Chukwudi Arinze Ugochukwu Onyeka Ejike Izuchukwu Chimezie Kamsi Echezona Azubuike Somto"),
              _s("Okafor Okonkwo Eze Nwosu Okeke Nwachukwu Onyekachi Ugwu Okoye Nnadi Chukwu Agu Ibe Nwankwo Okoro Ezeh Anyanwu Uzor Onwuka Ogbonna Nwafor  Ekwueme Iwu Mbah Udeh Okpara Ezenwa Nweke")),
    "ng_ha": (_s("Aisha Amina Fatima Hauwa Hadiza Zainab Maryam Khadija Halima Rakiya Safiya Bilkisu Hafsat Nafisa Asmau Jamila Habiba Rahma Sadiya Zulaihat  Ummi Fiddausi Saadatu Balaraba Lami Talatu Ladi Hassana"),
              _s("Abubakar Aminu Bashir Ibrahim Musa Sani Usman Yusuf Abdullahi Garba Haruna Idris Jibril Kabiru Lawal Mustapha Nasiru Salisu Shehu Umar  Yakubu Zubairu Auwal Bello Danjuma Hamza Isah Mahmud"),
              _s("Abdullahi Bello Garba Ibrahim Musa Sani Usman Yusuf Aliyu Danladi Lawal Shehu Suleiman Umar Yakubu Adamu Haruna Mohammed Kabir Idris Tanko  Jibrin Ahmad Sadiq Isa Dauda Maikano Gambo Tijjani")),
    "ng_ss": (_s("Ese Efe Ivie Ebiere Tari Preye Ekaette Eno Affiong Imaobong Mfon Doowuese Mnena Ochanya Ene Ufuoma Oghenekaro Tamara Boma Ibinabo  Edidiong Uduak Osasere Erhuvwu Ebiye Nosa"),
              _s("Efosa Osagie Osaro Eghosa Ovie Oghenero Tamuno Ebikabo Ekpo Etim Effiong Udo Terver Aondona Msughter Ochai Ejeh Tonye Kuro Tuoyo  Ubong Enobong Ita Ebimo Osas Akpos"),
              _s("Edet Bassey Okon Etim Effiong Ekpo Udo Inyang Ita Omoregie Idahosa Igbinoba Osemwegie Briggs Amadi Akpan Tamuno Ikyo Tersoo Ochigbo Agbo  Ugbah Ejembi Erhabor Okotie Ighodalo Ayakoroma Ekanem")),
    "gh_ak": (_s("Abena Adwoa Akosua Akua Ama Afia Yaa Esi Efua Araba Ekua Adjoa Serwaa Afua Pokua Dufie Konadu Akyaa Ewurabena Ewurama Nhyira Afriyie  Agyeiwaa Gifty Abigail Priscilla Mercy Comfort Dorcas Naa"),
              _s("Kwame Kofi Kwabena Kwaku Yaw Kwasi Kojo Kwadwo Fiifi Ebo Kobina Kwesi Kwamena Akwasi Ekow Kweku Emmanuel Daniel Samuel Prince Isaac  Stephen Richard Nii Kwabla Edmund Benjamin"),
              _s("Mensah Owusu Boateng Asante Appiah Osei Agyemang Antwi Amoah Darko Frimpong Gyamfi Kyei Opoku Ofori Sarpong Adjei Ansah Asamoah Oppong  Bonsu Nyarko Adomako Yeboah Amankwah Kusi Tetteh Quaye Lamptey Addo")),
    "gh_ew": (_s("Elinam Esinam Dzifa Mawusi Sedinam Akpene Delali Enyonam Xorlali Selasi Afi Abla Edinam Eyram Makafui Sena Yayra Mawunyo Dela Aseye"),
              _s("Selorm Edem Elikem Senyo Kafui Mawuli Dela Eli Kodzo Komla Yao Kossi Etornam Seyram Klenam Worlanyo Fafali Kekeli Elorm Dodzi"),
              _s("Agbeko Dzokoto Kpodo Ahiadzro Amegashie Kumah Adzraku Ametepe Dogbe Hlordzi Agbenyega Fiadzigbey Kugblenu Akorli Afetsi Gbeve Ahadzie  Kwashie Abotsi Dumenu")),
    "gh_no": (_s("Ayishetu Mariam Fuseina Asana Memunatu Rahinatu Salamatu Hawawu Zenabu Abiba Fatima Amina Sumaya Wumpini Azara Mansura Barikisu  Lamisi Habiba Hamdia"),
              _s("Alhassan Iddrisu Fuseini Mohammed Abdulai Issahaku Sumaila Yakubu Zakaria Seidu Mumuni Osman Wumbei Sulemana Abdul_Rahman Baba Tahiru  Abukari Shaibu Mahamudu"),
              _s("Iddrisu Alhassan Abdulai Fuseini Mumuni Seidu Yakubu Issah Sulemana Zakaria Mahamudu Bawa Amadu Tahiru Abukari Shaibu Sayibu Wumbei  Inusah Kpemah")),
    "sn": (_s("Aminata Awa Fatou Mariama Ndeye Khady Coumba Astou Bineta Rokhaya Dieynaba Adama Sokhna Yacine Ndella Maimouna Seynabou Khadija Nafissatou  Oumou Ramatoulaye Penda Absa Marieme"),
           _s("Mamadou Moussa Ibrahima Cheikh Abdoulaye Ousmane Modou Pape Lamine Babacar Aliou Malick Serigne Souleymane Mouhamed Assane Alassane Djibril  Saliou Omar Idrissa Amadou Fallou Birame"),
           _s("Diop Ndiaye Fall Gueye Sarr Ba Diallo Sow Cisse Mbaye Seck Diouf Thiam Faye Kane Ndour Niang Toure Sy Dieng Sall Wade Mbengue Samb")),
    "mande": (_s("Aminata Fatoumata Mariam Kadiatou Aissata Oumou Hawa Djeneba Assitan Kadidia Salimata Nana Bintou Rokia Sitan Awa Mariko Fanta  Aicha Djelika Korotoumou Massaran"),
              _s("Mamadou Moussa Seydou Boubacar Amadou Ibrahim Bakary Adama Souleymane Oumar Lassana Modibo Sekou Mahamadou Drissa Sidiki Youssouf  Abdoulaye Siaka Daouda Issa Karim"),
              _s("Traore Coulibaly Diarra Keita Kone Sangare Toure Cisse Diallo Camara Sidibe Doumbia Dembele Konate Kante Sissoko Ballo Fofana Sylla  Barry Bah Conde Soumah Kourouma")),
    "ci": (_s("Adjoua Amenan Affoue Akissi Aya Ahou Amoin Mariam Aminata Fatou Clarisse Prisca Estelle Christelle Sandrine Nadege Josiane Laetitia  Grace Brigitte Mireille Solange"),
           _s("Kouame Kouassi Konan Yao Kouadio Koffi N_Guessan Ange Serge Didier Herve Patrice Arsene Brice Sylvain Moussa Lassina Ibrahim Seydou  Yacouba Adama Bakary"),
           _s("Kouame Kouassi Konan Yao Kouadio Koffi N_Guessan Kone Coulibaly Traore Bamba Diabate Yapi Assi Aka Ehui Gnagne Brou Kacou  Tanoh Amani Bile Zadi")),
    "bj_tg": (_s("Akossiwa Afi Ama Adjo Abla Kafui Edem Ayaba Rachida Bernadette Clementine Gisele Nadia Mireille Sena Yawa Dede Akofa Fifamè Houéfa  Nadège Carine"),
              _s("Koffi Kossi Kodjo Kokou Yao Komlan Edem Sena Gildas Romaric Fiacre Ulrich Serge Rodrigue Arnaud Christophe Ibrahim Rachidi Moussa  Fataou Abdou Hervé"),
              _s("Agbodjan Mensah Adjovi Houngbo Akpovi Dossou Gbaguidi Hounkpatin Ahouansou Assogba Kpadonou Amoussou Agossou Zinsou Houessou  Tchakpélé Djossou Kossivi Ayité Lawson Ajavon Ekué")),
    "ne": (_s("Aichatou Mariama Haoua Rakia Zeinabou Fati Hadiza Ramatou Safiatou Balkissa Salamatou Hassana Ousseina Nana Aissa Djamila Rahila  Mariamou Hawa Amina"),
           _s("Moussa Ibrahim Abdou Hamani Boubacar Oumarou Souleymane Seydou Idrissa Harouna Mahamadou Amadou Salifou Hassane Ali Garba  Yacouba Abdoulaye Adamou Moustapha"),
           _s("Moussa Ibrahim Abdou Hamani Boubacar Oumarou Souleymane Seydou Idrissa Harouna Mahamadou Amadou Salifou Hassane Garba Yacouba Adamou  Maiga Tahirou Zakari")),
    "mr": (_s("Mariem Aicha Fatimetou Khadijetou Mounina Zeinebou Vatma Meimouna Lalla Toutou Selma Oumkelthoum Aminetou Mekfoula Salka Nana  Messouda Halima"),
           _s("Mohamed Ahmed Sidi Cheikh Brahim Abdallahi Mohamedou Moctar Isselmou Ely Ahmedou Salem Yahya Mahfoudh Moulaye Babacar Lemrabott El_Hacen  Abderrahmane Hamoud"),
           _s("Ould_Ahmed Ould_Sidi Ould_Cheikh Ould_Brahim Ould_Mohamed Ould_Salem Ould_Yahya Ould_Ely Ould_Moctar Ould_Abdallahi Ould_Hamoud  Ould_Isselmou Ould_Mahfoudh Ould_Babah Ould_Lemine Ould_Boye Ould_Dahi Ould_Mbareck")),
    "lr_sl": (_s("Fatmata Mariatu Aminata Isatu Kadiatu Hawa Musu Mamie Comfort Patience Princess Blessing Esther Martha Rebecca Satta Yei Kebeh Korto  Jenneh Massa Tenneh"),
              _s("Mohamed Abu Alhaji Ibrahim Sorie Foday Lansana Momodu Augustine Emmanuel Joseph Samuel Prince Varney Kollie Boima Sekou Momo Tamba  Saah Gbessay Kpanneh"),
              _s("Kamara Sesay Conteh Koroma Bangura Turay Mansaray Kanu Jalloh Fofanah Kollie Johnson Toe Flomo Kpoto Tarr Gbessay Massaquoi  Kpaka Fomba Sheriff Jusu Bockarie")),
    "lusophone": (_s("Ana Maria Joana Isabel Teresa Luisa Sara Catarina Beatriz Filomena Esperança Graça Conceição Lurdes Fátima Domingas Rosa Celeste  Helena Inês Madalena Neusa Yolanda Elisa"),
                  _s("João José António Manuel Francisco Carlos Pedro Paulo Domingos Joaquim Fernando Mário Alberto Augusto Celso Edson Hélder Nelson  Valter Wilson Armando Cândido Simão Belmiro"),
                  _s("Silva Santos Ferreira Pereira Costa Sousa Gomes Lopes Mendes Fernandes Rodrigues Martins Carvalho Almeida Cardoso Gonçalves Pinto  Teixeira Correia Baptista Monteiro Tavares Vieira Fortes")),
    "ao": (_s("Ana Maria Joana Isabel Teresa Luzia Esperança Graça Conceição Domingas Rosa Celeste Helena Madalena Neusa Yolanda Elisa Wanda Kiesse  Ngueza Ndumba Nzinga"),
           _s("João José António Manuel Francisco Carlos Pedro Paulo Domingos Joaquim Fernando Mário Alberto Augusto Celso Edson Hélder Nelson Valter  Kiala Ngola Nzau"),
           _s("Silva Ferreira Pereira Costa Sousa Gomes Lopes Mendes Fernandes Martins Cardoso Gonçalves Pinto Teixeira Baptista Monteiro Tavares  Vieira Kiala Mbala Ngola Mateus Domingos Kassoma Cassule")),
    "mz": (_s("Ana Maria Joana Isabel Teresa Luisa Sara Esperança Graça Conceição Lurdes Fátima Celeste Helena Madalena Neusa Yolanda Elisa Anifa  Rabia Atija"),
           _s("João José António Manuel Francisco Carlos Pedro Paulo Domingos Joaquim Fernando Mário Alberto Augusto Celso Edson Hélder Nelson Valter  Abdul Momade Ussene"),
           _s("Silva Santos Ferreira Pereira Costa Sousa Gomes Lopes Mendes Fernandes Macuácua Cossa Sitoe Mabunda Langa Tembe Muianga  Mate Nhantumbo Cumbe Massingue Bila")),
    # ---------------------------------------------------------------- North Africa (Arabic / Amazigh-friendly)
    "arab_n": (_s("Fatima Aisha Mariam Nour Salma Yasmine Leila Amina Khadija Hana Rania Dina Sara Mona Heba Nadia Zineb Imane Asmae Houda Samira  Naima Karima Lamia Rim Sanaa"),
               _s("Mohamed Ahmed Youssef Omar Ali Karim Hassan Mahmoud Mostafa Tarek Amine Mehdi Hamza Bilal Khaled Walid Nabil Samir Rachid Anas  Ayoub Adel Hichem Sofiane Yassine Hatem"),
               _s("Benali Mansour Haddad Saidi Cherif Belkacem Hamdi Rahmani Khelifi Ziani Amrani Tahiri Bennani Alaoui Idrissi Fassi  Kettani Chraibi Naciri Belhaj Trabelsi Jebali Gharbi Mejri Abdelaziz Hassan Benjelloun Lahlou")),
    "eg": (_s("Fatma Aya Nour Salma Yasmin Mariam Habiba Hana Rania Dina Sara Mona Heba Nadia Reem Menna Shaimaa Doaa Asmaa Esraa Marwa Nesma Mai  Rehab Ola Samar"),
           _s("Mohamed Ahmed Mahmoud Mostafa Omar Ali Karim Hassan Tarek Amr Khaled Waleed Hany Sherif Hossam Islam Mina Bishoy Ramy Sameh Ayman  Tamer Yasser Hesham Ehab Wael"),
           _s("Abdelrahman Hassan Hussein Ibrahim Mahmoud Mostafa Fathy Gamal Adel Saber Shaker Ragab Farouk Mansour Selim Naguib Ezzat Lotfy  Rizk Soliman Hamed Zaki Amin Ashour Kamel Girgis Hanna Tawfik")),
    "sd": (_s("Fatima Amna Asma Mariam Hiba Rayan Sara Safa Marwa Tasneem Nusiba Huda Ilham Samah Nafisa Rasha Sawsan Hanan Duaa Afraa"),
           _s("Mohamed Ahmed Osman Mustafa Abdelrahim Hassan Ali Omer Elsadig Yasir Hamza Mohanad Muntasir Khalid Hisham Awad Babiker Tariq Hatim  Elfatih Mujahid"),
           _s("Osman Ahmed Mohamed Abdalla Babiker Elamin Hassan Ibrahim Elsheikh Yousif Mahjoub Abdelgadir Hamid Musa Adam Ishag Taha Elnour  Bakheet Saeed Eltayeb Fadul")),
    "amazigh": (_s("Dihya Tanirt Tifawt Thiziri Lounja Tafsut Taous Tinhinane Siman Kahina Tanina Thanina Massilia Ilina Tiziri  Nawal Lydia Souad Malika"),
                _s("Massinissa Yuba Amazigh Idir Aksil Mazigh Juba Ameziane Aghiles Anir Yanis Amayas Koceila Lounes Ferhat Mokrane Rachid Hocine  Said Mustapha"),
                _s("Amrouche Hamidouche Ouali Belaid Hadjres Iberkane Ouchen  Akli Aouchiche Bellil Haddadi")),
    # ---------------------------------------------------------------- Horn of Africa
    "et_am": (_s("Hiwot Selamawit Bethlehem Meron Tigist Mahlet Rahel Hanna Liya Eden Saron Kidist Yeshi Tsion Mekdes Hanan Helen Marta Tsehay Ruth  Feven Bezawit"),
              _s("Abebe Dawit Tesfaye Yonas Henok Biniyam Samuel Getachew Mulugeta Solomon Tewodros Kidus Natnael Mikiyas Yared Eyob Bereket Alemu  Fasil Ermias Amanuel"),
              _s("Bekele Tadesse Alemu Haile Gebre Desta Wolde Assefa Tesfaye Girma Kebede Abate Mekonnen Ayele Demissie Lemma Worku  Hailu Getachew Tefera Belay")),
    "et_om": (_s("Chaltu Lensa Hawi Bontu Ifa Gadise Hanna Ebise Meseret Tsion Ayantu Kume Biftu Caalaa Lalise Abdiyo Elfnesh Obse Tolani Darartu"),
              _s("Gemechu Tolosa Lemi Abdisa Jaal Galana Chala Bona Dereje Fikadu Mosisa Tolera Gadaa Lencho Biru Teshome Debela Abdi Kebede Waqo"),
              _s("Gemechu Tolosa Abdisa Chala Fikadu Mosisa Tolera Lencho Biru Teshome Debela Kebede Waqo Bekele Gudeta Fayisa  Megersa Tufa Jilo Boru")),
    "ti": (_s("Senait Mebrat Rahwa Selam Freweini Luwam Yohanna Saba Eden Winta Helen Senay Ruta Selamawit Aster Tsega Nardos Mahlet Abeba"),
           _s("Tesfay Hagos Gebremedhin Berhe Kidane Tekle Yohannes Haile Mehari Amanuel Habtom Samuel Yonas Filmon Daniel Aron Kibrom Natnael  Mussie"),
           _s("Tesfay Hagos Gebremedhin Berhe Kidane Tekle Yohannes Haile Mehari Habtom Asmerom Woldu Abraha Gebru Kahsay  Teklehaimanot Mebrahtu Weldemariam Fesseha")),
    "so": (_s("Hodan Ifrah Ayan Sahra Hibo Faadumo Amina Khadra Ladan Ubah Nasra Deeqa Hamdi Sagal Fardowsa Muna Asha Hawa Shukri"),
           _s("Abdi Ahmed Mohamed Hassan Abdirahman Abdullahi Omar Ali Yusuf Farah Ismail Mahad Liban Bashir Hamza Guled Said Jama Warsame Osman"),
           _s("Abdi Ahmed Mohamed Hassan Abdirahman Abdullahi Omar Ali Yusuf Farah Ismail Warsame Osman Jama Nur Aden Hersi Dahir Egal Samatar  Guleid Mohamud")),
    "ss": (_s("Achol Nyandeng Abuk Ayen Nyibol Akuol Adut Athieng Nyanchuol Nyakuoth Mary Rebecca Grace Elizabeth Agnes Nyalang Adhieu Awien  Akech Nyabuoy"),
           _s("Deng Garang Majok Kuol Chol Mabior Akol Ayuel Bol Malual Gatluak Kuach Lual Makuei Akoon Duku Lado Wani Lomoro"),
           _s("Deng Garang Majok Kuol Chol Mabior Akol Ayuel Bol Malual Gatluak Kuach Lual Akoon Duku Lado Wani Lomoro Thon Aguer Mayen Bior")),
    # ---------------------------------------------------------------- East Africa
    "ke_ce": (_s("Wanjiru Wambui Njeri Wairimu Nyambura Wanjiku Muthoni Waithera Njoki Gathoni Wangui Mumbi Nyokabi Faith Mercy Esther Grace Joy Lucy  Caroline Ann Kawira Makena Karimi"),
              _s("Kamau Njoroge Mwangi Kariuki Kimani Githinji Maina Gitau Mugo Ndungu Waweru Karanja Njuguna Kinyua Brian Kevin Dennis James Peter  Joseph Samuel Murithi Mutuma Kirimi"),
              _s("Kamau Mwangi Njoroge Kariuki Kimani Maina Gitau Mugo Ndungu Waweru Karanja Njuguna Kinyua Muriuki Macharia Wachira Gachanja  Githaiga Mbugua Murithi Mutuma Kirimi Mwenda Kinoti")),
    "ke_lu": (_s("Achieng Akinyi Atieno Awino Adhiambo Anyango Auma Apiyo Akoth Aoko Millicent Beatrice Pamela Lilian Sharon Diana Nekesa Nafula  Nasimiyu Naliaka Nanjala Nabwire Kemunto Moraa"),
              _s("Ochieng Otieno Odhiambo Omondi Owino Onyango Oduor Okoth Ouma Opiyo Victor George Collins Fred Wanjala Wafula Barasa Wekesa  Simiyu Masinde Ongeri Nyakundi Momanyi"),
              _s("Ochieng Otieno Odhiambo Omondi Owino Onyango Oduor Okoth Ouma Opiyo Ogola Okello Oloo Obura Oketch Wanjala Wafula Barasa Wekesa  Simiyu Makokha Masinde Shikuku Wanyonyi Khaemba Nyakundi Momanyi Ombati")),
    "ke_ka": (_s("Chebet Jepkoech Jeptoo Chepkemoi Cherono Chelangat Jerono Chepngeno Jelagat Chemutai Vivian Gladys Mwende Mutheu Ndinda Kalekye  Mumbua Nduku Kavata Syombua Mueni"),
              _s("Kiprono Kiprotich Kibet Kipkemboi Cheruiyot Kiptoo Rotich Langat Koech Kirui Korir Ngetich Gideon Wesley Mutua Kioko Mwendwa Mutinda  Muthama Kyalo Muli"),
              _s("Kiprono Kiprotich Kibet Rotich Langat Koech Kirui Korir Ngetich Cheruiyot Kiptoo Bett Kemboi Tanui Mutai Sang Mutua Kioko Mwendwa  Mutinda Muthama Kilonzo Nzioka Kyalo Wambua Ndambuki")),
    "sw": (_s("Neema Rehema Zawadi Halima Saumu Mwanaisha Mwanajuma Furaha Amina Asha Zuhura Upendo Imani Tumaini Pendo Agnes Esther Grace Witness  Happiness Joyce Mwajuma Subira Faraja"),
           _s("Hamisi Juma Bakari Salim Rashid Omar Baraka Emmanuel Godfrey Erasto Mussa Shaban Daudi Petro Elia Yohana Athumani Ramadhani Hassani  Selemani Faraji Zuberi Kassim Ally"),
           _s("Mwakyusa Massawe Shirima Kimaro Mushi Lyimo Swai Mollel Laizer Mbwambo Kipanga Mwita Chacha Magesa Mwakalinga Kombo  Mbaga Mrisho Salim Bakari Hamisi Kassim Juma Mnyika Kahindi Kazungu Katana")),
    "ug": (_s("Nakato Nansubuga Namubiru Nalubega Nabirye Namutebi Nakimuli Babirye Kisakye Nassali Achan Akello Apio Atim Lamunu Aber Brenda Doreen  Patience Esther Joan Sarah"),
           _s("Mukasa Ssemakula Kato Wasswa Okello Ochen Opio Odongo Ojok Mugisha Tumusiime Byaruhanga Kizito Ssali Lubega Kiggundu Isaac Ronald  Moses Joseph Brian Arthur"),
           _s("Mukasa Ssemakula Ssali Lubega Kiggundu Kizito Nsubuga Mugisha Tumusiime Byaruhanga Turyahikayo Kabuye Okello Ochen Opio Odongo Ojok  Oryem Atwine Ahimbisibwe Asiimwe Kakooza Musoke Mwesigwa")),
    "rw_bi": (_s("Uwase Ishimwe Umutoni Mutoni Uwimana Ingabire Mukamana Iradukunda Keza Umuhoza Niyonsaba Irakoze Gatesi Kamikazi Teta Uwera  Nshuti Divine Aline Claudine"),
              _s("Habimana Niyonzima Mugisha Ndayisaba Nshimiyimana Hakizimana Bizimana Uwimana Kwizera Mutabazi Niyomugabo Ndikumana  Iradukunda Gatete Mugabo Eric Jean Claude Patrick Olivier"),
              _s("Habimana Niyonzima Mugisha Ndayisaba Nshimiyimana Hakizimana Bizimana Uwimana Kwizera Mutabazi Niyomugabo Ndikumana Gatete Mugabo  Rukundo Twagirayezu Munyaneza Nsengiyumva Ntwari Nzeyimana")),
    # ---------------------------------------------------------------- Central Africa
    "cm_fr": (_s("Aurelie Christelle Sandrine Nadege Josiane Larissa Carine Brenda Estelle Murielle Patricia Rosine Vanessa Yvonne Manuela  Mireille Clarisse Ornella Gaelle Hadjara Aissatou"),
              _s("Serge Didier Herve Patrice Arsene Brice Sylvain Junior Franck Landry Thierry Yannick Cedric Romuald Arnaud Boris Ulrich Hamadou  Oumarou Moussa Ibrahim Alim"),
              _s("Mbarga Ngono Essomba Atangana Owona Ondoua Mballa Mbia Fouda Abena Manga Biyong Ewane Ngando Eboa Tchinda Fotso Kamga  Tchoumi Nana Djoumessi Hamadou Bouba Oumarou")),
    "cm_en": (_s("Blessing Precious Pamela Doris Beatrice Mercy Gladys Joan Prisca Ruth Bih Nchang Ngum Lum Kah Siri Mbong Enanga Ebude Mesumbe"),
              _s("Emmanuel Clovis Ernest Godlove Divine Kingsley Elvis Collins Fred Wilfred Akwo Ngwa Tanyi Ndi Che Fru Nfor Tabe Ebai Ashu"),
              _s("Fru Nfor Tabe Ebai Ashu Ngwa Tanyi Ndi Che Neba Ngu Mbah Fon Tamfu Ayuk Enow Nkwain Nji Ambe Mbuh")),
    "cg_cd": (_s("Grace Merveille Nathalie Esther Rachel Ruth Sarah Christelle Gloire Benedicte Dorcas Ornella Prisca Josephine Mamie Nsimba Nzuzi  Mbuyi Kabibi Masika Furaha Neema"),
              _s("Jean Joseph Patrick Christian Fiston Cedric Junior Glody Trésor Exaucé Héritier Dieudonné Blaise Fabrice Guy Kabeya Mukendi  Ilunga Kasongo Bahati Amani Baraka"),
              _s("Mukendi Ilunga Kabeya Kasongo Tshibangu Kalala Mbuyi Lukusa Ngoy Kalonji Nsimba Makiadi Mabiala Lutete Mpiana  Mbala Bahati Amani Kahindo Muhindo Kambale Paluku")),
    "ga_gq": (_s("Christelle Nadege Murielle Sandrine Aurelie Josiane Carine Ornella Vanessa Prisca Mireille Estelle Elodie Gisele Marie_Jose  Raissa Beatriz Lucia"),
              _s("Serge Didier Herve Patrice Arsene Brice Sylvain Junior Franck Landry Thierry Yannick Cedric Romuald Ulrich Fabrice Santiago  Emilio Esono"),
              _s("Ndong Obame Mba Ondo Nze Essono Ella Mintsa Moussavou Mouketou Boussougou Koumba Nzamba Mabika Nkoghe Engonga  Mangue")),
    "cf_td": (_s("Achta Hawa Zara Khadija Fatime Halime Mariam Amina Nadia Grace Esther Prisca Josiane Clarisse Sandrine Bernadette Nicole Yvette  Mireille Pascaline"),
              _s("Mahamat Abakar Hissein Moussa Ahmat Brahim Oumar Youssouf Adoum Djimet Nguerassem Ngarlejy Ndoubabe Jean Pascal Serge  Thierry Didier Fidele"),
              _s("Mahamat Abakar Hissein Moussa Ahmat Brahim Oumar Youssouf Adoum Djimet Nguerassem Ngarmbaye Ndoubabe Ngakoutou  Kossi Ngaba Zanga Yakite Doumta")),
    # ---------------------------------------------------------------- Southern Africa
    "za_ng": (_s("Nomvula Thandiwe Lindiwe Zanele Nokuthula Sibongile Ayanda Nandi Lerato Zinhle Nosipho Thandeka Busisiwe Nompumelelo Lungile  Siphesihle Andiswa Zodwa Nomsa Phumzile Asanda Khanyisile"),
              _s("Sipho Thabo Mandla Bongani Sibusiso Themba Lwazi Siyabonga Lungelo Andile Musa Sizwe Mthunzi Nkosinathi Xolani Luthando Ayanda  Lucky Vusi Sandile Zola Mzwandile"),
              _s("Dlamini Nkosi Ndlovu Khumalo Mkhize Ngcobo Mthembu Cele Shabalala Mahlangu Zungu Gumede Ntuli Mabaso  Majola Hlongwane Sithole Xaba Mbatha Ngubane Mngadi Nxumalo Tshabalala")),
    "za_xh": (_s("Nomsa Thandeka Nolwazi Siphokazi Unathi Zintle Nosiphiwo Ayabonga Lindelwa Babalwa Nomonde Zukiswa Asisipho Yonela Nwabisa  Ziyanda Sinazo Noluthando Thembela Akhona"),
              _s("Lwando Siyabulela Luvuyo Aphiwe Lubabalo Mzukisi Sipho Thando Sinethemba Ayanda Lithemba Simphiwe Loyiso Sizwe Unathi Zola  Khaya Lutho Mihlali Anele"),
              _s("Ngcukana Ntshona Mbiza Gqola Dyantyi Mxenge Qwabe Zwane Matiwane Nkqayi Mgudlwa Nqweniso Ndamase Sigcau Makhaya  Ngxola Dlomo Mabandla Mpofu")),
    "za_so": (_s("Lerato Palesa Mpho Dineo Refilwe Kgomotso Boitumelo Naledi Tshepiso Masego Karabo Tumelo Dimakatso Mamello Reitumetse Keabetswe  Lesedi Nthabiseng Puleng Tebogo Kelebogile Onalenna"),
              _s("Thabo Tshepo Kagiso Lesego Mpho Karabo Tumelo Kabelo Neo Thapelo Tebogo Katlego Lefa Teboho Mosa Tshepang Kgosi Oratile Mothusi  Bakang Kamogelo Lebogang"),
              _s("Mokoena Molefe Mofokeng Modise Masilo Mokgosi Mothibi Moloi Letsoalo  Maluleke Baloyi Mathebula Nemavhola Ramashia Serame Phiri Seleka Matlala")),
    "za_af": (_s("Anika Elize Marike Chantelle Liesl Annelie Zelda Carmen Simone Bianca Tessa Leandri Michelle Nicole Jessica Kayla Shireen Fatima  Nadia Megan"),
              _s("Pieter Johan Riaan Willem Jacques Hendrik Gerhard Francois Ruan Wynand Craig Ryan Jason Brandon Dylan Shaun Ashwin Faizal Yusuf Ricardo"),
              _s("Van_der_Merwe Botha Pretorius Smit Du_Plessis Venter Coetzee Nel Jacobs Fourie Steyn Le_Roux Swanepoel Kruger Naidoo Pillay Govender  Adams Williams Hendricks Isaacs Petersen Abrahams Daniels Arendse")),
    "zw": (_s("Tendai Rudo Tsitsi Chipo Nyasha Farai Rumbidzai Tariro Ruvimbo Vimbai Shamiso Tatenda Kudzai Tafadzwa Chiedza Nokuthula Sithembile  Thandeka Precious Memory Fadzai Ropafadzo"),
           _s("Tendai Tafadzwa Tatenda Tinashe Farai Kudakwashe Takudzwa Tapiwa Simbarashe Munyaradzi Tonderai Blessing Brighton Prosper Lovemore  Mthulisi Sibusiso Themba Nkosana Bhekithemba Fortune Nyasha"),
           _s("Moyo Ncube Sibanda Dube Ndlovu Mpofu Nyathi Chikwanha Mutasa Chigumba Chinembiri Gumbo Mhlanga Marufu Makoni Mlambo  Mushonga Muchena Chirwa Hove Shumba Nhamo")),
    "zm_mw": (_s("Chanda Mwila Bwalya Mutale Natasha Mwansa Thandiwe Chipo Mercy Grace Esther Linda Memory Chikondi Tiyamike Kondwani Thokozani  Mphatso Takondwa Alinafe Tadala Chimwemwe"),
              _s("Mwamba Mulenga Chilufya Bwalya Chanda Mwansa Kabwe Musonda Chisanga Mutale Kondwani Chikondi Mphatso Thokozani Blessings Yamikani  Limbani Pemphero Tiwonge Gift Moses Joseph"),
              _s("Mwamba Mulenga Chilufya Bwalya Chanda Mwansa Kabwe Musonda Chisanga Mutale Phiri Mwale Tembo Chirwa Nyirenda  Mkandawire Kumwenda Gondwe Msiska Kamanga Kalua Chisale Mhango")),
    "tswana": (_s("Lorato Boitumelo Kelebogile Onalenna Masego Naledi Neo Tebogo Goitseone Kagiso Mpho Refilwe Palesa Dineo Lesego Kefilwe Gaone  Tshiamo Oratile Keneilwe Mamello Nthabiseng Lineo Mpolokeng"),
               _s("Kagiso Thabo Tshepo Lesego Kabelo Neo Thapelo Tebogo Katlego Mothusi Bakang Kamogelo Oratile Kgosi Onkemetse Tumelo Thato Teboho  Lefa Retselisitsoe Tsepo Mosa Bokang Lehlohonolo"),
               _s("Molefe Modise Mokgosi Mothibi Moloi Kgosidintsi Gaolathe Kebonang Motsumi Tau  Molapo Ramaili Sello Mofokeng Phiri")),
    "sz": (_s("Nomvula Thandiwe Lindiwe Zanele Nokuthula Sibongile Nandi Zinhle Nosipho Thandeka Busisiwe Nompumelelo Lungile Siphesihle Phindile  Temalangeni Ntombi Fikile Nonhlanhla Gcebile"),
           _s("Sipho Mandla Bongani Sibusiso Themba Lwazi Siyabonga Lungelo Andile Musa Sizwe Mthunzi Nkosinathi Xolani Bheki Mduduzi Sandile Vusi  Mbongeni Sabelo"),
           _s("Dlamini Nkambule Simelane Mamba Shongwe Hlophe Masilela Motsa Mdluli Mavuso Khumalo Ginindza Nxumalo Mkhonta Magagula Tsabedze Zwane  Kunene Matsebula Shabangu")),
    "na": (_s("Ndapewa Ndeshipanda Hilma Selma Aune Ndinelago Taimi Martha Saara Loide Hileni Maria Anna Anika Elize Ester Kauna Panduleni  Kandiwapa Nangula"),
           _s("Tangeni Ndapanda Petrus Johannes Paulus Simon Festus Elias Tomas Hafeni Shikongo Pendapala Tuhafeni Kaupo Mekondjo Kandjii Uakii  Pieter Johan Riaan"),
           _s("Shikongo Amupolo Iipumbu Nangolo Shilongo Haufiku Nghipondoka Kandjii Kaupo Amutenya Shilunga  Haimbodi Nekongo Uushona Beukes Swartbooi")),
    # ---------------------------------------------------------------- Indian Ocean
    "mg": (_s("Hanitra Fanja Voahangy Lalao Noro Haingo Tiana Mialy Fara Rindra Hasina Nirina Sarobidy Tsiry Mamy Ony Volana Faniry Lova Tahina"),
           _s("Rakoto Rivo Andry Tsiry Hery Mamy Fidy Tahina Ando Toky Haja Nirina Feno Lova Herizo Solofo Faly Rado Tojo Mahery"),
           _s("Rakotomalala Rasoanaivo Randriamanantena Rakotoarisoa Andrianarisoa Razafindrakoto Rabemananjara Rasolofonirina Ravelojaona  Andriamahefa Raharimanana Razanamparany Rakotonirina Randrianasolo Ratsimbazafy Rasamoelina Rakotondrabe  Rabearivelo Andriantsoa")),
    "mu_sc": (_s("Priya Anjali Kavita Sabrina Melanie Cindy Natacha Vanessa Nadia Aurelie Shabnam Fatima Ruby Sheila Laetitia Joelle Marie_Claire  Sandrine Kelly Daphne"),
              _s("Rajesh Vikash Anil Ravi Kevin Jean_Marc Jean_Pierre Stephane Yannick Didier Imran Faisal Ashley Ryan Christopher Patrick Gilbert  Joachim Ronny Neil"),
              _s("Ramdhony Seeboo Doorgakant Appadoo Pillay Ramsamy Laval Lebrasse Lagesse Moutou  Bastien Larose Hoareau Payet Michel Morel Pothin Esparon Dubignon Barbé Fanchette")),
    "km": (_s("Fatima Mariama Zalhata Moinaecha Echata Rahmatou Amina Nadjati Faouzia Hadidja Soifia Zaharia Hidaya Rachida Nadia Zainaba"),
           _s("Said Ahmed Ali Mohamed Abdallah Ibrahim Hamidou Moussa Soilihi Youssouf Djaffar Toyb Houmadi Salim Ismael Fahardine"),
           _s("Said Ahmed Ali Mohamed Abdallah Ibrahim Hamidou Moussa Soilihi Youssouf Djaffar Houmadi Salim Mzé Bacar Msaidié Attoumane  Mmadi Chamassi")),
}
# Exact full names of well-known public figures that the lists could still produce. Matched case-insensitively.
FAMOUS = {n.lower() for n in [
    "Babatunde Fashola", "Bola Tinubu", "Muhammadu Buhari", "Atiku Abubakar", "Peter Obi", "Ngozi Okonjo-Iweala", "Aliko Dangote", "Wole Soyinka",
    "Chinua Achebe", "Chimamanda Adichie", "Ahmed Musa", "Victor Osimhen", "Kelechi Iheanacho", "Wilfred Ndidi", "Asisat Oshoala", "Davido",
    "Femi Kuti", "Tiwa Savage", "Yemi Alade", "Kwame Nkrumah", "Kofi Annan", "John Mahama", "Asamoah Gyan", "Michael Essien", "Abedi Pele",
    "Sarkodie", "Macky Sall", "Sadio Mane", "Kalidou Koulibaly", "Youssou Ndour", "Ibrahima Konate", "Didier Drogba", "Yaya Toure", "Alassane Ouattara",
    "Mohamed Salah", "Mohamed Elneny", "Abdel Fattah", "Amr Diab", "Naguib Mahfouz", "Achraf Hakimi", "Hakim Ziyech", "Youssef En-Nesyri", "Riyad Mahrez",
    "Ismael Bennacer", "Abiy Ahmed", "Haile Gebrselassie", "Kenenisa Bekele", "Tirunesh Dibaba", "Derartu Tulu", "Teddy Afro", "Sahle-Work Zewde",
    "William Ruto", "Uhuru Kenyatta", "Raila Odinga", "Eliud Kipchoge", "Faith Kipyegon", "Victor Wanyama", "Lupita Nyongo", "Wangari Maathai",
    "Kalonzo Musyoka", "Samia Hassan", "Samia Suluhu", "John Magufuli", "Diamond Platnumz", "Mbwana Samatta", "Yoweri Museveni", "Bobi Wine",
    "Paul Kagame", "Cyril Ramaphosa", "Nelson Mandela", "Jacob Zuma", "Thabo Mbeki", "Julius Malema", "Siya Kolisi", "Trevor Noah", "Caster Semenya",
    "Emmerson Mnangagwa", "Robert Mugabe", "Nelson Chamisa", "Hakainde Hichilema", "Lazarus Chakwera", "Peter Mutharika", "Joyce Banda",
    "Mokgweetsi Masisi", "Duma Boko", "Hage Geingob", "Netumbo Nandi-Ndaitwah", "Filipe Nyusi", "Daniel Chapo", "Joao Lourenco", "João Lourenço",
    "Jose Eduardo dos Santos", "Isabel dos Santos", "Agostinho Neto", "Felix Tshisekedi", "Denis Sassou", "Paul Biya", "Samuel Etoo", "Roger Milla",
    "Vincent Aboubakar", "Andre Onana", "Mahamat Deby", "Idriss Deby", "Faustin-Archange Touadera", "Ali Bongo", "Brice Oligui", "Teodoro Obiang",
    "Assimi Goita", "Ibrahim Traore", "Abdourahamane Tiani", "Mohamed Bazoum", "Patrice Talon", "Faure Gnassingbe", "Mamadi Doumbouya",
    "Julius Maada Bio", "George Weah", "Joseph Boakai", "Ellen Johnson Sirleaf", "Adama Barrow", "Umaro Sissoco", "Ulisses Correia", "Jose Maria Neves",
    "Carlos Vila Nova", "Andry Rajoelina", "Navin Ramgoolam", "Wavel Ramkalawan", "Azali Assoumani", "Ismail Omar Guelleh", "Hassan Sheikh Mohamud",
    "Isaias Afwerki", "Salva Kiir", "Riek Machar", "Abdel Fattah al-Burhan", "Kais Saied", "Abdelmadjid Tebboune", "Mohammed Ould Ghazouani",
    "Mohamed Ould Ghazouani", "Evariste Ndayishimiye", "Mswati", "Sam Matekane", "Abdelaziz Bouteflika", "Moammar Gaddafi", "Mohamed Morsi",
]}


# Region-name tokens per country that select a zone. First match wins; otherwise the country default.
# Lists are lower-case substrings of geoBoundaries ADM1 names.
COUNTRY_ZONES: dict[str, dict] = {
    "NG": {"default": "ng_yo", "mix": ["ng_yo", "ng_ig", "ng_ha", "ng_ss"], "rules": [
        (("lagos", "ogun", "oyo", "osun", "ondo", "ekiti", "kwara"), "ng_yo"),
        (("anambra", "enugu", "imo", "abia", "ebonyi"), "ng_ig"),
        (("kano", "kaduna", "katsina", "sokoto", "kebbi", "zamfara", "jigawa", "bauchi", "gombe", "yobe", "borno", "adamawa", "niger"), "ng_ha"),
        (("rivers", "bayelsa", "delta", "edo", "cross river", "akwa ibom", "benue", "plateau", "taraba", "kogi", "nasarawa"), "ng_ss"),
        (("abuja", "federal capital"), "mix")]},
    "GH": {"default": "gh_ak", "mix": ["gh_ak", "gh_ew", "gh_no"], "rules": [
        (("volta", "oti"), "gh_ew"), (("northern", "savannah", "north east", "upper east", "upper west"), "gh_no"), (("greater accra",), "mix")]},
    "KE": {"default": "ke_ce", "mix": ["ke_ce", "ke_lu", "ke_ka", "sw"], "rules": [
        (("kisumu", "siaya", "homa bay", "migori", "kakamega", "bungoma", "busia", "vihiga", "trans nzoia", "kisii", "nyamira"), "ke_lu"),
        (("uasin gishu", "nandi", "kericho", "bomet", "baringo", "elgeyo", "west pokot", "machakos", "kitui", "makueni"), "ke_ka"),
        (("mombasa", "kilifi", "kwale", "lamu", "tana river", "taita"), "sw"),
        (("garissa", "wajir", "mandera"), "so"), (("nairobi",), "mix")]},
    "ZA": {"default": "za_ng", "mix": ["za_ng", "za_xh", "za_so", "za_af"], "rules": [
        (("kwazulu", "mpumalanga"), "za_ng"), (("eastern cape",), "za_xh"), (("western cape", "northern cape"), "za_af"),
        (("free state", "north west", "limpopo"), "za_so"), (("gauteng",), "mix")]},
    "ET": {"default": "et_am", "mix": ["et_am", "et_om", "ti"], "rules": [
        (("oromia",), "et_om"), (("tigray",), "ti"), (("somali",), "so"), (("addis", "dire dawa"), "mix")]},
    "CM": {"default": "cm_fr", "mix": ["cm_fr", "cm_en"], "rules": [(("north west", "northwest", "south west", "southwest"), "cm_en")]},
    "MA": {"default": "arab_n", "mix": ["arab_n", "amazigh"], "rules": [(("souss", "draa", "dra"), "mix")]},
    "DZ": {"default": "arab_n", "mix": ["arab_n", "amazigh"], "rules": [(("tizi", "bejaia", "béjaïa", "bouira", "boumerdes"), "amazigh")]},
}
DEFAULT_ZONE = {
    "SN": "sn", "GM": "sn", "ML": "mande", "GN": "mande", "BF": "mande", "CI": "ci", "BJ": "bj_tg", "TG": "bj_tg", "NE": "ne", "MR": "mr",
    "LR": "lr_sl", "SL": "lr_sl", "CV": "lusophone", "GW": "lusophone", "ST": "lusophone", "AO": "ao", "MZ": "mz",
    "EG": "eg", "LY": "arab_n", "TN": "arab_n", "SD": "sd", "SO": "so", "DJ": "so", "ER": "ti", "SS": "ss",
    "TZ": "sw", "UG": "ug", "RW": "rw_bi", "BI": "rw_bi", "CD": "cg_cd", "CG": "cg_cd", "GA": "ga_gq", "GQ": "ga_gq", "CF": "cf_td", "TD": "cf_td",
    "ZW": "zw", "ZM": "zm_mw", "MW": "zm_mw", "BW": "tswana", "LS": "tswana", "SZ": "sz", "NA": "na",
    "MG": "mg", "MU": "mu_sc", "SC": "mu_sc", "KM": "km",
}


def zone_for(cc: str, adm1_name: str, draw: float, draw2: float) -> str:
    """Naming zone for a persona: the ADM1 rule (if any), with 20% mixing inside multi-zone countries (cities are mixed)."""
    spec = COUNTRY_ZONES.get(cc)
    if not spec:
        return DEFAULT_ZONE.get(cc, "lr_sl")
    low = (adm1_name or "").lower()
    z = spec["default"]
    for toks, zone in spec["rules"]:
        if any(t in low for t in toks):
            z = zone
            break
    if z == "mix" or draw < 0.2:
        mix = spec["mix"]
        z = mix[int(draw2 * len(mix)) % len(mix)]
    return z
