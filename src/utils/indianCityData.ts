/*
 * Preliminary city-level design screening data for Indian residential projects.
 * Seismic zoning follows IS 1893 (Part 1): 2016, Annex A; basic wind speeds
 * are the IS 875 (Part 3) Appendix A map values.  Soil, SBC, terrain and rain
 * values are conservative regional defaults only.  A geotechnical investigation,
 * local wind/topography assessment and the currently applicable code edition are
 * mandatory before design or construction.
 */

export interface CityEngineeringData {
  city: string;
  state: string;
  seismicZone: 'II' | 'III' | 'IV' | 'V';
  zoneFactor: number;
  basicWindSpeedMps: number;
  soilType: 'Hard Rock' | 'Medium/Stiff Soil' | 'Soft Soil' | 'Marine Clay' | 'Black Cotton' | 'Alluvial' | 'Laterite' | 'Sandy' | 'Red Soil' | 'Gravelly';
  defaultSBC_kNm2: number;
  rainfallCategory: 'Low' | 'Moderate' | 'Heavy' | 'Very Heavy';
  terrainCategory: 1 | 2 | 3 | 4;
  coastalProximity: boolean;
  notes?: string;
}

type Zone = CityEngineeringData['seismicZone'];
type Soil = CityEngineeringData['soilType'];
type Rain = CityEngineeringData['rainfallCategory'];

const ZONE_FACTOR: Record<Zone, number> = { II: 0.10, III: 0.16, IV: 0.24, V: 0.36 };

function c(
  city: string, state: string, seismicZone: Zone, basicWindSpeedMps: number,
  soilType: Soil, defaultSBC_kNm2: number, rainfallCategory: Rain,
  terrainCategory: 1 | 2 | 3 | 4, coastalProximity: boolean, notes?: string,
): CityEngineeringData {
  return { city, state, seismicZone, zoneFactor: ZONE_FACTOR[seismicZone], basicWindSpeedMps,
    soilType, defaultSBC_kNm2, rainfallCategory, terrainCategory, coastalProximity, notes };
}

export const INDIAN_CITY_DATA: CityEngineeringData[] = [
  // Andhra Pradesh
  c('Visakhapatnam','Andhra Pradesh','II',50,'Sandy',120,'Heavy',3,true,'cyclonic coast; assess storm surge and corrosion'),
  c('Vijayawada','Andhra Pradesh','III',50,'Alluvial',120,'Heavy',2,false,'Krishna delta/alluvial deposits; high water table possible'),
  c('Guntur','Andhra Pradesh','III',50,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Tirupati','Andhra Pradesh','III',44,'Red Soil',150,'Moderate',2,false),
  c('Kurnool','Andhra Pradesh','II',44,'Black Cotton',100,'Low',2,false,'expansive soil possible'),
  c('Nellore','Andhra Pradesh','III',50,'Alluvial',120,'Heavy',2,true,'coastal/deltaic groundwater may be shallow'),
  c('Rajahmundry','Andhra Pradesh','III',50,'Alluvial',120,'Heavy',2,false,'Godavari alluvium'),
  c('Kakinada','Andhra Pradesh','III',50,'Sandy',110,'Heavy',2,true,'cyclonic coast'),
  c('Anantapur','Andhra Pradesh','II',39,'Red Soil',150,'Low',2,false),
  c('Kadapa','Andhra Pradesh','II',39,'Red Soil',150,'Low',2,false),
  c('Ongole','Andhra Pradesh','III',44,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),

  // Arunachal Pradesh
  c('Itanagar','Arunachal Pradesh','V',47,'Medium/Stiff Soil',150,'Very Heavy',2,false,'high seismicity; slope stability and drainage critical'),
  c('Naharlagun','Arunachal Pradesh','V',47,'Alluvial',120,'Very Heavy',2,false,'high seismicity; flooding/slope assessment needed'),
  c('Pasighat','Arunachal Pradesh','V',47,'Alluvial',120,'Very Heavy',2,false,'high seismicity and very high rainfall'),
  c('Tawang','Arunachal Pradesh','V',39,'Hard Rock',300,'Heavy',2,false,'mountain site; snow, slope and rock-mass assessment required'),

  // Assam
  c('Guwahati','Assam','V',50,'Alluvial',120,'Very Heavy',3,false,'high seismicity; Brahmaputra floodplain/soft pockets'),
  c('Dibrugarh','Assam','V',50,'Alluvial',100,'Very Heavy',2,false,'floodplain and high water table'),
  c('Jorhat','Assam','V',50,'Alluvial',120,'Very Heavy',2,false,'high seismicity'),
  c('Silchar','Assam','V',50,'Alluvial',110,'Very Heavy',2,false,'Barak valley flooding potential'),
  c('Tezpur','Assam','V',50,'Alluvial',120,'Very Heavy',2,false,'high seismicity'),
  c('Nagaon','Assam','V',50,'Alluvial',110,'Very Heavy',2,false,'floodplain conditions possible'),
  c('Tinsukia','Assam','V',50,'Alluvial',100,'Very Heavy',2,false,'high water table/flooding possible'),

  // Bihar
  c('Patna','Bihar','IV',47,'Alluvial',120,'Heavy',3,false,'Ganga alluvium; high water table and liquefaction screening'),
  c('Gaya','Bihar','III',47,'Alluvial',140,'Moderate',2,false),
  c('Muzaffarpur','Bihar','IV',47,'Alluvial',110,'Heavy',2,false,'floodplain/high water table possible'),
  c('Bhagalpur','Bihar','IV',47,'Alluvial',110,'Heavy',2,false,'Ganga alluvium'),
  c('Darbhanga','Bihar','V',47,'Alluvial',100,'Heavy',2,false,'high seismicity and flooding potential'),
  c('Purnia','Bihar','IV',47,'Alluvial',100,'Heavy',2,false,'high rainfall and flooding potential'),
  c('Ara','Bihar','IV',47,'Alluvial',120,'Moderate',2,false),
  c('Bihar Sharif','Bihar','III',47,'Alluvial',130,'Moderate',2,false),

  // Chhattisgarh
  c('Raipur','Chhattisgarh','II',39,'Black Cotton',100,'Moderate',2,false,'expansive soil - special foundation detailing'),
  c('Bilaspur','Chhattisgarh','II',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Bhilai','Chhattisgarh','II',39,'Black Cotton',100,'Moderate',3,false,'expansive soil possible'),
  c('Durg','Chhattisgarh','II',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Korba','Chhattisgarh','II',39,'Red Soil',150,'Moderate',2,false),
  c('Jagdalpur','Chhattisgarh','II',39,'Red Soil',150,'Heavy',2,false),
  c('Rajnandgaon','Chhattisgarh','II',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Ambikapur','Chhattisgarh','III',39,'Red Soil',150,'Moderate',2,false),

  // Goa
  c('Panaji','Goa','III',39,'Laterite',150,'Very Heavy',2,true,'lateritic profile; monsoon drainage and coastal corrosion'),
  c('Margao','Goa','III',39,'Laterite',150,'Very Heavy',2,true,'lateritic profile; monsoon drainage'),
  c('Vasco da Gama','Goa','III',39,'Laterite',150,'Very Heavy',2,true,'coastal corrosion exposure'),
  c('Mapusa','Goa','III',39,'Laterite',150,'Very Heavy',2,true),

  // Gujarat
  c('Ahmedabad','Gujarat','III',39,'Alluvial',150,'Low',3,false,'Sabarmati alluvium; verify variable strata'),
  c('Surat','Gujarat','III',44,'Alluvial',120,'Heavy',3,true,'coastal/deltaic groundwater and corrosion considerations'),
  c('Vadodara','Gujarat','III',39,'Alluvial',140,'Moderate',3,false),
  c('Rajkot','Gujarat','III',44,'Medium/Stiff Soil',150,'Low',2,false),
  c('Bhuj','Gujarat','V',44,'Sandy',110,'Low',2,false,'Kutch Zone V; liquefaction/site response screening required'),
  c('Gandhinagar','Gujarat','III',39,'Alluvial',150,'Low',2,false),
  c('Jamnagar','Gujarat','III',44,'Medium/Stiff Soil',150,'Low',2,true,'coastal saline exposure possible'),
  c('Anand','Gujarat','III',39,'Alluvial',140,'Moderate',2,false),
  c('Bharuch','Gujarat','III',44,'Alluvial',120,'Heavy',2,true,'Narmada alluvium and coastal influence'),
  c('Bhavnagar','Gujarat','III',44,'Sandy',110,'Low',2,true,'coastal saline exposure'),
  c('Junagadh','Gujarat','III',44,'Medium/Stiff Soil',150,'Moderate',2,false),
  c('Mehsana','Gujarat','III',39,'Alluvial',140,'Low',2,false),
  c('Morbi','Gujarat','III',44,'Medium/Stiff Soil',150,'Low',2,false),
  c('Kutch','Gujarat','V',44,'Sandy',100,'Low',1,false,'regional Kutch entry; exact town and site assessment essential'),

  // Haryana
  c('Gurugram','Haryana','IV',47,'Alluvial',150,'Moderate',3,false,'NCR alluvium; local Aravalli rock may occur'),
  c('Faridabad','Haryana','IV',47,'Alluvial',140,'Moderate',3,false,'NCR alluvium; local rock/outcrop possible'),
  c('Ambala','Haryana','IV',47,'Alluvial',140,'Moderate',2,false),
  c('Karnal','Haryana','IV',47,'Alluvial',130,'Moderate',2,false),
  c('Panipat','Haryana','IV',47,'Alluvial',130,'Moderate',2,false),
  c('Hisar','Haryana','II',47,'Sandy',120,'Low',2,false),
  c('Rohtak','Haryana','III',47,'Alluvial',130,'Low',2,false),
  c('Sonipat','Haryana','IV',47,'Alluvial',130,'Moderate',2,false),
  c('Panchkula','Haryana','IV',47,'Gravelly',200,'Moderate',2,false,'foothill site; assess slope/drainage'),
  c('Yamunanagar','Haryana','IV',47,'Alluvial',130,'Moderate',2,false),

  // Himachal Pradesh
  c('Shimla','Himachal Pradesh','IV',39,'Hard Rock',300,'Heavy',3,false,'hilly terrain: slope, retaining wall and drainage design essential'),
  c('Manali','Himachal Pradesh','IV',39,'Gravelly',200,'Heavy',2,false,'mountain site; snow and slope assessment required'),
  c('Dharamshala','Himachal Pradesh','V',47,'Gravelly',200,'Very Heavy',2,false,'high seismicity; slope and drainage critical'),
  c('Mandi','Himachal Pradesh','IV',39,'Gravelly',200,'Heavy',2,false,'slope stability required'),
  c('Solan','Himachal Pradesh','IV',39,'Hard Rock',300,'Heavy',2,false,'hilly terrain'),
  c('Kullu','Himachal Pradesh','IV',39,'Gravelly',200,'Heavy',2,false,'valley alluvium varies; slope assessment'),
  c('Hamirpur','Himachal Pradesh','IV',39,'Hard Rock',300,'Moderate',2,false),

  // Jharkhand
  c('Ranchi','Jharkhand','II',39,'Laterite',150,'Moderate',2,false,'lateritic residual soil; verify depth to rock'),
  c('Jamshedpur','Jharkhand','II',39,'Red Soil',150,'Moderate',3,false),
  c('Dhanbad','Jharkhand','III',39,'Red Soil',150,'Moderate',2,false,'mining influence may need investigation'),
  c('Bokaro','Jharkhand','II',39,'Red Soil',150,'Moderate',2,false),
  c('Deoghar','Jharkhand','III',39,'Red Soil',150,'Moderate',2,false),
  c('Hazaribagh','Jharkhand','II',39,'Laterite',150,'Moderate',2,false),
  c('Giridih','Jharkhand','III',39,'Red Soil',150,'Moderate',2,false),

  // Karnataka
  c('Bengaluru','Karnataka','II',33,'Red Soil',150,'Moderate',3,false,'residual red soil/granite; verify weathered rock profile'),
  c('Mysuru','Karnataka','II',33,'Red Soil',150,'Moderate',2,false),
  c('Hubli-Dharwad','Karnataka','II',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Mangaluru','Karnataka','III',39,'Laterite',150,'Very Heavy',3,true,'very high rainfall; coastal corrosion and drainage'),
  c('Belagavi','Karnataka','III',39,'Black Cotton',100,'Heavy',2,false,'expansive soil possible'),
  c('Kalaburagi','Karnataka','II',39,'Black Cotton',100,'Low',2,false,'expansive soil possible'),
  c('Shivamogga','Karnataka','II',39,'Laterite',150,'Heavy',2,false),
  c('Davangere','Karnataka','II',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Ballari','Karnataka','II',39,'Red Soil',150,'Low',2,false),
  c('Tumakuru','Karnataka','II',33,'Red Soil',150,'Moderate',2,false),
  c('Udupi','Karnataka','III',39,'Laterite',150,'Very Heavy',2,true,'coastal high-rainfall location'),
  c('Vijayapura','Karnataka','II',39,'Black Cotton',100,'Low',2,false,'expansive soil possible'),

  // Kerala
  c('Thiruvananthapuram','Kerala','III',39,'Laterite',150,'Very Heavy',3,true,'laterite, monsoon drainage and coastal corrosion'),
  c('Kochi','Kerala','III',39,'Marine Clay',60,'Very Heavy',3,true,'marine clay/high water table; specialist geotechnical design required'),
  c('Kozhikode','Kerala','III',39,'Laterite',150,'Very Heavy',3,true,'high rainfall and coastal exposure'),
  c('Thrissur','Kerala','III',39,'Laterite',150,'Very Heavy',2,false,'high rainfall drainage essential'),
  c('Kollam','Kerala','III',39,'Sandy',110,'Very Heavy',2,true,'coastal groundwater and corrosion'),
  c('Kannur','Kerala','III',39,'Laterite',150,'Very Heavy',2,true),
  c('Alappuzha','Kerala','III',39,'Marine Clay',60,'Very Heavy',2,true,'low-lying marine/alluvial clay; high water table'),
  c('Kottayam','Kerala','III',39,'Laterite',150,'Very Heavy',2,false),
  c('Palakkad','Kerala','III',39,'Laterite',150,'Heavy',2,false),

  // Madhya Pradesh
  c('Jabalpur','Madhya Pradesh','III',44,'Black Cotton',100,'Moderate',2,false,'expansive soil - special foundation detailing; local seismic history'),
  c('Bhopal','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',3,false,'expansive soil possible'),
  c('Indore','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',3,false,'expansive soil - special foundation detailing'),
  c('Gwalior','Madhya Pradesh','III',39,'Alluvial',130,'Low',2,false),
  c('Ujjain','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Rewa','Madhya Pradesh','III',39,'Red Soil',150,'Moderate',2,false),
  c('Sagar','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Satna','Madhya Pradesh','III',39,'Red Soil',150,'Moderate',2,false),
  c('Dewas','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Ratlam','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Khandwa','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',2,false),
  c('Burhanpur','Madhya Pradesh','III',39,'Black Cotton',100,'Moderate',2,false),
  c('Chhindwara','Madhya Pradesh','III',39,'Red Soil',150,'Moderate',2,false),
  c('Shivpuri','Madhya Pradesh','III',39,'Red Soil',150,'Moderate',2,false),

  // Maharashtra
  c('Mumbai','Maharashtra','III',44,'Marine Clay',60,'Heavy',4,true,'marine clay/reclaimed land possible; high water table and corrosion'),
  c('Pune','Maharashtra','III',39,'Laterite',150,'Moderate',3,false,'basalt/weathered laterite; verify local strata'),
  c('Nagpur','Maharashtra','II',44,'Black Cotton',100,'Moderate',3,false,'expansive soil - special foundation detailing'),
  c('Nashik','Maharashtra','III',39,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Chhatrapati Sambhajinagar','Maharashtra','II',39,'Black Cotton',100,'Moderate',2,false,'formerly Aurangabad; expansive soil possible'),
  c('Thane','Maharashtra','III',44,'Marine Clay',60,'Heavy',3,true,'creek-side soft/marine clay possible'),
  c('Navi Mumbai','Maharashtra','III',44,'Marine Clay',60,'Heavy',3,true,'reclaimed/creek-side ground possible'),
  c('Kolhapur','Maharashtra','III',39,'Black Cotton',100,'Heavy',2,false,'expansive soil possible'),
  c('Solapur','Maharashtra','III',39,'Black Cotton',100,'Low',2,false,'expansive soil possible'),
  c('Amravati','Maharashtra','II',44,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Akola','Maharashtra','II',44,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Sangli','Maharashtra','III',39,'Black Cotton',100,'Moderate',2,false),
  c('Jalgaon','Maharashtra','II',44,'Black Cotton',100,'Moderate',2,false),
  c('Nanded','Maharashtra','II',39,'Black Cotton',100,'Moderate',2,false),
  c('Latur','Maharashtra','III',39,'Black Cotton',100,'Moderate',2,false,'1993 earthquake region; expansive soil possible'),
  c('Satara','Maharashtra','III',39,'Laterite',150,'Heavy',2,false),

  // Manipur
  c('Imphal','Manipur','V',47,'Alluvial',110,'Heavy',2,false,'high seismicity; valley deposits and drainage require assessment'),
  c('Thoubal','Manipur','V',47,'Alluvial',110,'Heavy',2,false,'high seismicity'),
  c('Churachandpur','Manipur','V',47,'Medium/Stiff Soil',150,'Heavy',2,false,'high seismicity and hill-slope assessment'),

  // Meghalaya
  c('Shillong','Meghalaya','V',47,'Hard Rock',300,'Very Heavy',3,false,'high seismicity; steep terrain and drainage'),
  c('Tura','Meghalaya','V',47,'Laterite',150,'Very Heavy',2,false,'high seismicity and rainfall'),
  c('Jowai','Meghalaya','V',47,'Hard Rock',300,'Very Heavy',2,false,'high seismicity and steep terrain'),

  // Mizoram
  c('Aizawl','Mizoram','V',47,'Medium/Stiff Soil',150,'Very Heavy',3,false,'high seismicity; steep slope and drainage design critical'),
  c('Lunglei','Mizoram','V',47,'Medium/Stiff Soil',150,'Very Heavy',2,false,'high seismicity and slope stability'),
  c('Champhai','Mizoram','V',47,'Medium/Stiff Soil',150,'Heavy',2,false,'high seismicity and hill-slope assessment'),

  // Nagaland
  c('Kohima','Nagaland','V',47,'Medium/Stiff Soil',150,'Heavy',3,false,'high seismicity; slope assessment required'),
  c('Dimapur','Nagaland','V',47,'Alluvial',120,'Heavy',2,false,'high seismicity and alluvial ground'),
  c('Mokokchung','Nagaland','V',47,'Medium/Stiff Soil',150,'Heavy',2,false,'high seismicity and slope stability'),

  // Odisha
  c('Bhubaneswar','Odisha','III',50,'Laterite',150,'Heavy',3,false,'cyclone exposure; drainage and wind design important'),
  c('Cuttack','Odisha','III',50,'Alluvial',110,'Heavy',3,false,'deltaic alluvium/flooding potential'),
  c('Puri','Odisha','III',50,'Sandy',100,'Heavy',2,true,'cyclonic coast; saline groundwater/storm surge considerations'),
  c('Rourkela','Odisha','II',39,'Red Soil',150,'Moderate',2,false),
  c('Sambalpur','Odisha','II',39,'Red Soil',150,'Moderate',2,false),
  c('Berhampur','Odisha','III',50,'Red Soil',150,'Heavy',2,true,'cyclone exposure'),
  c('Balasore','Odisha','III',50,'Alluvial',110,'Heavy',2,true,'cyclonic coast and alluvium'),
  c('Jharsuguda','Odisha','II',39,'Red Soil',150,'Moderate',2,false),

  // Punjab
  c('Ludhiana','Punjab','IV',47,'Alluvial',130,'Moderate',3,false),
  c('Amritsar','Punjab','IV',47,'Alluvial',130,'Moderate',3,false),
  c('Jalandhar','Punjab','IV',47,'Alluvial',130,'Moderate',3,false),
  c('Patiala','Punjab','IV',47,'Alluvial',130,'Moderate',2,false),
  c('Bathinda','Punjab','III',47,'Alluvial',130,'Low',2,false),
  c('Mohali','Punjab','IV',47,'Alluvial',140,'Moderate',3,false,'foothill influence; verify local deposits'),
  c('Hoshiarpur','Punjab','IV',47,'Gravelly',200,'Moderate',2,false,'foothill deposits possible'),
  c('Firozpur','Punjab','III',47,'Alluvial',120,'Low',2,false),

  // Rajasthan
  c('Jaipur','Rajasthan','II',39,'Sandy',120,'Low',3,false,'variable sandy/residual soil; verify bearing stratum'),
  c('Jodhpur','Rajasthan','II',47,'Sandy',120,'Low',2,false,'high wind region; sandy soil'),
  c('Udaipur','Rajasthan','II',39,'Hard Rock',300,'Moderate',2,false,'rocky terrain; assess weathered seams'),
  c('Ajmer','Rajasthan','II',39,'Gravelly',200,'Low',2,false),
  c('Bikaner','Rajasthan','II',47,'Sandy',100,'Low',2,false,'windblown sand; settlement assessment'),
  c('Kota','Rajasthan','II',39,'Hard Rock',300,'Moderate',2,false),
  c('Alwar','Rajasthan','II',47,'Sandy',120,'Moderate',2,false),
  c('Bharatpur','Rajasthan','II',47,'Alluvial',130,'Moderate',2,false),
  c('Sikar','Rajasthan','II',47,'Sandy',120,'Low',2,false),
  c('Bhilwara','Rajasthan','II',39,'Hard Rock',300,'Low',2,false),
  c('Sri Ganganagar','Rajasthan','II',47,'Sandy',110,'Low',2,false),

  // Sikkim
  c('Gangtok','Sikkim','IV',39,'Hard Rock',300,'Very Heavy',3,false,'steep Himalayan site; slope, drainage and seismic detailing critical'),
  c('Namchi','Sikkim','IV',39,'Hard Rock',300,'Very Heavy',2,false,'slope stability and drainage essential'),
  c('Gyalshing','Sikkim','IV',39,'Hard Rock',300,'Very Heavy',2,false,'hilly terrain'),

  // Tamil Nadu
  c('Chennai','Tamil Nadu','III',50,'Sandy',110,'Heavy',4,true,'cyclonic coast; coastal groundwater/corrosion and flooding'),
  c('Coimbatore','Tamil Nadu','III',39,'Red Soil',150,'Moderate',3,false),
  c('Madurai','Tamil Nadu','II',39,'Red Soil',150,'Moderate',2,false),
  c('Tiruchirappalli','Tamil Nadu','II',39,'Alluvial',130,'Moderate',2,false,'Cauvery alluvium locally'),
  c('Salem','Tamil Nadu','II',39,'Red Soil',150,'Moderate',2,false),
  c('Vellore','Tamil Nadu','III',39,'Red Soil',150,'Moderate',2,false),
  c('Tirunelveli','Tamil Nadu','II',39,'Red Soil',150,'Moderate',2,false),
  c('Erode','Tamil Nadu','II',39,'Red Soil',150,'Moderate',2,false),
  c('Thoothukkudi','Tamil Nadu','II',50,'Sandy',110,'Low',2,true,'coastal saline/corrosion exposure'),
  c('Kanchipuram','Tamil Nadu','III',50,'Sandy',120,'Moderate',2,false),
  c('Pudukkottai','Tamil Nadu','II',39,'Red Soil',150,'Moderate',2,false),
  c('Hosur','Tamil Nadu','II',39,'Red Soil',150,'Moderate',2,false),

  // Telangana
  c('Hyderabad','Telangana','II',44,'Red Soil',150,'Moderate',3,false,'granite/residual red soil; verify weathered profile'),
  c('Warangal','Telangana','II',44,'Red Soil',150,'Moderate',2,false),
  c('Nizamabad','Telangana','II',44,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Karimnagar','Telangana','II',44,'Red Soil',150,'Moderate',2,false),
  c('Khammam','Telangana','II',44,'Red Soil',150,'Heavy',2,false),
  c('Ramagundam','Telangana','II',44,'Black Cotton',100,'Moderate',2,false,'expansive soil possible'),
  c('Mahbubnagar','Telangana','II',39,'Red Soil',150,'Low',2,false),

  // Tripura
  c('Agartala','Tripura','V',50,'Alluvial',110,'Very Heavy',3,false,'high seismicity; soft alluvial pockets and high rainfall'),
  c('Udaipur','Tripura','V',50,'Alluvial',110,'Very Heavy',2,false,'high seismicity and high rainfall'),
  c('Dharmanagar','Tripura','V',50,'Alluvial',110,'Very Heavy',2,false,'high seismicity'),

  // Uttar Pradesh
  c('Lucknow','Uttar Pradesh','III',47,'Alluvial',130,'Moderate',3,false,'alluvial deposits; verify water table'),
  c('Kanpur','Uttar Pradesh','III',47,'Alluvial',130,'Moderate',3,false),
  c('Varanasi','Uttar Pradesh','III',47,'Alluvial',130,'Moderate',3,false,'Ganga alluvium'),
  c('Agra','Uttar Pradesh','III',47,'Alluvial',130,'Low',3,false),
  c('Prayagraj','Uttar Pradesh','III',47,'Alluvial',120,'Moderate',3,false,'confluence alluvium/high water table possible'),
  c('Meerut','Uttar Pradesh','IV',47,'Alluvial',130,'Moderate',3,false),
  c('Gorakhpur','Uttar Pradesh','IV',47,'Alluvial',110,'Heavy',2,false,'floodplain/high water table possible'),
  c('Noida','Uttar Pradesh','IV',47,'Alluvial',130,'Moderate',3,false,'NCR alluvium'),
  c('Ghaziabad','Uttar Pradesh','IV',47,'Alluvial',130,'Moderate',3,false,'NCR alluvium'),
  c('Aligarh','Uttar Pradesh','III',47,'Alluvial',130,'Low',2,false),
  c('Bareilly','Uttar Pradesh','IV',47,'Alluvial',120,'Moderate',2,false),
  c('Moradabad','Uttar Pradesh','IV',47,'Alluvial',120,'Moderate',2,false),
  c('Jhansi','Uttar Pradesh','II',39,'Red Soil',150,'Moderate',2,false),
  c('Ayodhya','Uttar Pradesh','III',47,'Alluvial',120,'Moderate',2,false),
  c('Mathura','Uttar Pradesh','III',47,'Alluvial',130,'Low',2,false),
  c('Saharanpur','Uttar Pradesh','IV',47,'Alluvial',120,'Heavy',2,false),

  // Uttarakhand
  c('Dehradun','Uttarakhand','IV',47,'Gravelly',200,'Heavy',3,false,'Doon valley deposits; slope/drainage and seismic design required'),
  c('Haridwar','Uttarakhand','IV',47,'Alluvial',130,'Moderate',2,false,'Ganga alluvium; high water table possible'),
  c('Rishikesh','Uttarakhand','IV',47,'Gravelly',200,'Heavy',2,false,'foothill terrain and slope assessment'),
  c('Nainital','Uttarakhand','IV',39,'Hard Rock',300,'Heavy',3,false,'steep hillside; slope stability essential'),
  c('Haldwani','Uttarakhand','IV',47,'Gravelly',200,'Heavy',2,false,'bhabar deposits; site variability'),
  c('Roorkee','Uttarakhand','IV',47,'Alluvial',130,'Moderate',2,false),
  c('Almora','Uttarakhand','IV',39,'Hard Rock',300,'Heavy',2,false,'hilly terrain'),

  // West Bengal
  c('Kolkata','West Bengal','III',50,'Soft Soil',90,'Heavy',4,true,'deltaic soft alluvium/high water table; geotechnical investigation critical'),
  c('Siliguri','West Bengal','IV',47,'Alluvial',110,'Very Heavy',3,false,'foothill alluvium; high rainfall and seismicity'),
  c('Durgapur','West Bengal','III',47,'Red Soil',150,'Moderate',3,false),
  c('Asansol','West Bengal','III',47,'Red Soil',150,'Moderate',3,false,'mining influence may need investigation'),
  c('Howrah','West Bengal','III',50,'Soft Soil',90,'Heavy',4,true,'Hooghly alluvium/high water table'),
  c('Kharagpur','West Bengal','III',50,'Red Soil',150,'Heavy',2,false),
  c('Haldia','West Bengal','III',50,'Soft Soil',90,'Heavy',2,true,'coastal/estuarine soft soil and corrosion'),
  c('Malda','West Bengal','IV',47,'Alluvial',110,'Heavy',2,false,'alluvial soil and river-bank erosion potential'),

  // Union Territories
  c('New Delhi','Delhi','IV',47,'Alluvial',140,'Moderate',4,false,'NCR alluvium; local ridge rock and filled ground vary'),
  c('Delhi','Delhi','IV',47,'Alluvial',140,'Moderate',4,false,'NCR alluvium; local ridge rock and filled ground vary'),
  c('Chandigarh','Chandigarh','IV',47,'Alluvial',150,'Moderate',3,false,'foothill alluvial deposits'),
  c('Jammu','Jammu and Kashmir','IV',47,'Alluvial',130,'Moderate',2,false,'seismic and foothill drainage assessment'),
  c('Srinagar','Jammu and Kashmir','V',39,'Alluvial',110,'Moderate',3,false,'high seismicity; lake/valley deposits and water table'),
  c('Anantnag','Jammu and Kashmir','V',39,'Alluvial',110,'Moderate',2,false,'high seismicity'),
  c('Leh','Ladakh','IV',39,'Gravelly',200,'Low',1,false,'high-altitude cold desert; seismic, frost and snow actions'),
  c('Kargil','Ladakh','IV',39,'Gravelly',200,'Low',1,false,'high-altitude cold desert; seismic and frost actions'),
  c('Puducherry','Puducherry','III',50,'Sandy',110,'Heavy',3,true,'cyclonic coast; saline groundwater/corrosion possible'),
  c('Karaikal','Puducherry','III',50,'Sandy',110,'Heavy',2,true,'cyclonic coast'),
  c('Port Blair','Andaman and Nicobar Islands','V',50,'Laterite',150,'Very Heavy',2,true,'high seismicity, cyclonic/coastal exposure and heavy rain'),
  c('Car Nicobar','Andaman and Nicobar Islands','V',55,'Sandy',100,'Very Heavy',1,true,'very high wind/cyclonic and seismic exposure'),
  c('Kavaratti','Lakshadweep','III',55,'Sandy',100,'Heavy',1,true,'coral sand; marine exposure, storm surge and corrosion'),
  c('Daman','Dadra and Nagar Haveli and Daman and Diu','III',44,'Sandy',110,'Heavy',2,true,'coastal saline exposure'),
  c('Silvassa','Dadra and Nagar Haveli and Daman and Diu','III',44,'Laterite',150,'Heavy',2,false),
];

/** Normalizes spelling, punctuation and a small set of common Indian city variants. */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-IN')
    .replace(/&/g, ' and ')
    .replace(/[.'’()\-/_,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: 'bengaluru', mysore: 'mysuru', mangalore: 'mangaluru', belgaum: 'belagavi',
  gulbarga: 'kalaburagi', calicut: 'kozhikode', cochin: 'kochi', trivandrum: 'thiruvananthapuram',
  bombay: 'mumbai', aurangabad: 'chhatrapati sambhajinagar', banaras: 'varanasi',
  allahabad: 'prayagraj', gurgaon: 'gurugram', baroda: 'vadodara', trichy: 'tiruchirappalli',
};

function canonicalCity(value: string): string {
  const normalized = normalize(value);
  return CITY_ALIASES[normalized] ?? normalized;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j]!;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[b.length]!;
}

/**
 * Finds a city case-insensitively.  Exact normalized names and known former
 * names are preferred; a short edit-distance/contained-text fallback supports
 * minor spelling variations without silently returning an unrelated city.
 */
export function getCityData(city: string, state?: string): CityEngineeringData | null {
  const query = canonicalCity(city);
  if (!query) return null;
  const requestedState = state === undefined ? undefined : normalize(state);
  const candidates = requestedState === undefined
    ? INDIAN_CITY_DATA
    : INDIAN_CITY_DATA.filter((entry) => normalize(entry.state) === requestedState);
  const pool = candidates.length > 0 ? candidates : INDIAN_CITY_DATA;

  const exact = pool.find((entry) => canonicalCity(entry.city) === query);
  if (exact) return exact;

  const threshold = query.length <= 5 ? 1 : query.length <= 8 ? 2 : 3;
  let best: CityEngineeringData | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of pool) {
    const candidate = canonicalCity(entry.city);
    const distance = editDistance(query, candidate);
    const contained = query.length >= 4 && (candidate.includes(query) || query.includes(candidate));
    if ((contained || distance <= threshold) && distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

/** Returns a city match, or a deliberately conservative generic preliminary default. */
export function getDefaultCityData(city: string, state: string): CityEngineeringData {
  return getCityData(city, state) ?? c(
    city.trim() || 'Unknown City', state.trim() || 'Unknown State', 'III', 44,
    'Medium/Stiff Soil', 150, 'Moderate', 2, false,
    'Conservative preliminary default only; obtain site geotechnical and code-map verification.',
  );
}
