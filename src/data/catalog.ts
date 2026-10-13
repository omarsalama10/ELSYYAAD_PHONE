import raw from './catalog.json'
import type { Exercise, Metric } from '../domain/types'

interface RawExercise {
  id: string
  name: string
  muscles: string[]
  equipment: string
  category: string
  instructions: string[]
  images: string[]
}

interface Meta {
  nameAr: string
  cuesAr: string[]
  metric?: Metric
  unilateral?: boolean
  increment?: number
  name?: string
}

const DB = 2.5 // barbell / machine / cable step
const DBELL = 2 // per dumbbell step

/** Arabic names, coaching cues and tracking rules for every catalog exercise. */
export const META: Record<string, Meta> = {
  Kneeling_Hip_Flexor: { nameAr: 'إطالة عضلات الحوض الأمامية', metric: 'time', increment: 0, cuesAr: ['انزل على ركبة واحدة وادفع الحوض لقدام بهدوء', 'شد المؤخرة من ناحية الركبة اللي على الأرض', 'العدد بالثواني لكل ناحية'] },
  Cat_Stretch: { nameAr: 'إطالة القطة (Cat-Cow)', increment: 0, cuesAr: ['قوّس ظهرك لفوق وانت بتطلع النفس', 'انزل بالبطن وارفع الصدر وانت بتاخد نفس', 'الحركة بطيئة ومن العمود الفقري كله'] },
  Band_Pull_Apart: { nameAr: 'فتح الأستك للخلف', increment: 0, cuesAr: ['الدراع مفرود قدامك على مستوى الكتف', 'افتح لحد ما الأستك يلمس صدرك', 'اضغط لوحي الكتف على بعض ثانية'] },
  Dead_Bug: { nameAr: 'Dead Bug للبطن', increment: 0, cuesAr: ['ضهرك لازق في الأرض طول الوقت', 'افرد دراع ورجل عكس بعض ببطء', 'العدد لكل ناحية'] },
  Hack_Squat: { nameAr: 'هاك سكوات', increment: DB, cuesAr: ['رجليك في نص البلاتة بعرض الكتف', 'انزل لحد ما الفخد يبقى موازي أو أوطى', 'متقفلش الركبة خالص فوق'] },
  Dumbbell_Bench_Press: { nameAr: 'ضغط صدر دمبل', increment: DBELL, cuesAr: ['لوحي الكتف مضمومين ولازقين في البنش', 'انزل لحد مستوى الصدر والكوع بزاوية 45°', 'الوزن المسجّل = وزن دمبل واحد'] },
  Dumbbell_Incline_Row: { nameAr: 'سحب دمبل على بنش مايل (صدرك مسنود)', increment: DBELL, cuesAr: ['صدرك مسنود على البنش طول الحركة', 'اسحب الكوع لورا ناحية الوسط', 'اضغط لوحي الكتف فوق ثانية'] },
  Romanian_Deadlift: { nameAr: 'رومانيان ديدلفت', increment: DB, cuesAr: ['ظهرك مفرود والبار لازق في رجلك', 'ادفع الحوض لورا لحد ما تحس بشد ورا الفخد', 'اطلع بشد المؤخرة مش بالضهر'] },
  'Single-Leg_Leg_Extension': { nameAr: 'رفرفة أمامي رجل واحدة', unilateral: true, increment: DB, cuesAr: ['ابدأ بالرجل الأضعف', 'افرد الرجل للآخر واقف ثانية فوق', 'نزول بطيء 3 ثواني'] },
  Face_Pull: { nameAr: 'فيس بول (سحب للوش)', increment: DB, cuesAr: ['الحبل على مستوى الوش', 'اسحب ناحية جبهتك وافتح إيديك برة', 'ده أهم تمرين لاستقامة الضهر والكتف'] },
  Side_Lateral_Raise: { nameAr: 'رفرفة جانبي دمبل', increment: DBELL, cuesAr: ['كوعك مثني بسيط', 'ارفع لحد مستوى الكتف بس', 'متمرجحش جسمك'] },
  Hammer_Curls: { nameAr: 'هامر كيرل', increment: DBELL, cuesAr: ['قبضة محايدة (الإبهام لفوق)', 'الكوع ثابت جنبك', 'بيقوّي الساعد والباي مع بعض'] },
  'Triceps_Pushdown_-_Rope_Attachment': { nameAr: 'تراي بالحبل', increment: DB, cuesAr: ['الكوع لازق في جنبك', 'افتح الحبل تحت لبرة', 'متسيبش الوزن يطلع بسرعة'] },
  'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench': { nameAr: 'ساعد أمامي (كف لفوق)', increment: 1, cuesAr: ['الساعد مسنود على البنش والرسغ برة', 'سيب الدمبل ينزل لأطراف الصوابع وبعدين اقفل', 'حركة كاملة وبطيئة'] },
  'Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench': { nameAr: 'ساعد خلفي (كف لتحت)', increment: 1, cuesAr: ['الساعد مسنود والكف لتحت', 'ارفع ضهر الإيد لفوق', 'وزن خفيف وحركة نضيفة'] },
  Plank: { nameAr: 'بلانك', metric: 'time', increment: 0, cuesAr: ['جسمك خط مستقيم من الراس للكعب', 'شد البطن والمؤخرة', 'متنزلش الوسط'] },
  Walking_Treadmill: { nameAr: 'مشي على المشاية بميل', metric: 'cardio', increment: 0, cuesAr: ['ميل 8-12% وسرعة 5-6 كم/س', 'تقدر تتكلم بس نفسك عالي (Zone 2)', 'متمسكش في المشاية'] },
  Barbell_Hip_Thrust: { nameAr: 'هيب ثرست بالبار', increment: DB, cuesAr: ['لوح الكتف على البنش', 'ادفع بالكعب وشد المؤخرة فوق ثانية', 'دقنك لتحت وضلوعك مقفولة'] },
  'Wide-Grip_Lat_Pulldown': { nameAr: 'سحب عالي واسع', increment: DB, cuesAr: ['صدرك لفوق وميل بسيط لورا', 'اسحب البار لأعلى الصدر بالكوع', 'طلوع بطيء لحد ما الدراع يتفرد'] },
  Dumbbell_Shoulder_Press: { nameAr: 'ضغط كتف دمبل', increment: DBELL, cuesAr: ['قاعد وضهرك مسنود', 'ادفع لفوق من غير ما تقفل الكوع', 'متقوّسش ضهرك'] },
  Split_Squat_with_Dumbbells: { nameAr: 'بلغاري سكوات (رجل ورا على بنش)', unilateral: true, increment: DBELL, cuesAr: ['ابدأ بالرجل الأضعف', 'الرجل اللي ورا على البنش، انزل لتحت عمودي', 'ركبة الرجل اللي قدام في اتجاه الصوابع'] },
  Seated_Cable_Rows: { nameAr: 'سحب أرضي كابل', increment: DB, cuesAr: ['ضهرك مفرود وصدرك لفوق', 'اسحب للبطن واضغط لوحي الكتف', 'متمرجحش بجسمك'] },
  Incline_Dumbbell_Press: { nameAr: 'ضغط صدر عالي دمبل', increment: DBELL, cuesAr: ['البنش 30°', 'انزل لأعلى الصدر', 'ادفع لفوق وقرّب الدمبلز من بعض'] },
  Reverse_Flyes: { nameAr: 'رفرفة خلفي دمبل', increment: 1, cuesAr: ['انحني لقدام وضهرك مفرود', 'افتح إيديك لبرة بالكوع', 'وزن خفيف وتركيز على الكتف الخلفي'] },
  Hyperextensions_Back_Extensions: { nameAr: 'ظهر سفلي (Back Extension)', increment: 0, cuesAr: ['انزل لحد ما تحس بشد', 'اطلع لحد ما جسمك يبقى خط مستقيم بس', 'متقوّسش ضهرك فوق'] },
  Barbell_Curl: { nameAr: 'باي بار', increment: DB, cuesAr: ['الكوع ثابت جنبك', 'متمرجحش ضهرك', 'نزول بطيء'] },
  Cable_Rope_Overhead_Triceps_Extension: { nameAr: 'تراي فوق الراس بالحبل', increment: DB, cuesAr: ['ضهرك للكابل والكوع جنب راسك', 'افرد الدراع لقدام وفوق', 'إطالة كاملة ورا الراس'] },
  Farmers_Walk: { nameAr: 'مشية الفلاح', metric: 'distance', increment: DBELL, cuesAr: ['امسك دمبلين تقال وامشي مفرود', 'كتفك لورا ولتحت', 'بيقوّي القبضة والساعد والترابيس'] },
  Cable_Crunch: { nameAr: 'كرانش كابل', increment: DB, cuesAr: ['على ركبك والحبل جنب راسك', 'لف ضهرك لتحت بعضلات البطن', 'متشدّش بإيديك'] },
  Side_Bridge: { nameAr: 'بلانك جانبي', metric: 'time', unilateral: true, increment: 0, cuesAr: ['على الكوع وجسمك مستقيم', 'الوسط مرفوع ومتنزلش', 'العدد بالثواني لكل ناحية'] },
  'Isometric_Neck_Exercise_-_Front_And_Back': { nameAr: 'رقبة ثابت (قدام وورا)', metric: 'time', increment: 0, cuesAr: ['زق راسك في إيدك وإيدك تقاوم', 'من غير حركة، 50% من قوتك بس', 'قدام وبعدين ورا'] },
  Leg_Press: { nameAr: 'ليج برس', increment: DB, cuesAr: ['ضهرك لازق في الكرسي', 'انزل لحد 90° أو أوطى من غير ما الحوض يتشال', 'متقفلش الركبة فوق'] },
  'Band_Assisted_Pull-Up': { nameAr: 'عقلة بمساعدة (أستك أو جهاز)', increment: 0, cuesAr: ['ابدأ من دراع مفرود', 'اسحب صدرك للبار', 'قلل المساعدة مع الوقت'] },
  'Dips_-_Chest_Version': { nameAr: 'متوازي صدر (بمساعدة لو محتاج)', increment: 0, cuesAr: ['ميل لقدام بسيط', 'انزل لحد ما الكتف يبقى مستوى الكوع بس', 'لو حسيت بوجع في الكتف قلل النزول'] },
  Lying_Leg_Curls: { nameAr: 'رفرفة خلفي نايم', increment: DB, cuesAr: ['الحوض لازق في الجهاز', 'اقفل للآخر واقف ثانية', 'نزول بطيء'] },
  Standing_Calf_Raises: { nameAr: 'سمانة واقف', increment: DB, cuesAr: ['اطلع على أطراف صوابعك للآخر', 'انزل لتحت لحد ما تحس بإطالة', 'وقفة ثانية فوق وتحت'] },
  'One-Arm_Dumbbell_Row': { nameAr: 'سحب دمبل بإيد واحدة', unilateral: true, increment: DBELL, cuesAr: ['إيد وركبة على البنش وضهرك مفرود', 'اسحب الكوع ناحية جيبك', 'العدد لكل إيد'] },
  Seated_Side_Lateral_Raise: { nameAr: 'رفرفة جانبي قاعد', increment: DBELL, cuesAr: ['قاعد وضهرك مفرود', 'ارفع لحد مستوى الكتف', 'من غير مرجحة'] },
  Thigh_Adductor: { nameAr: 'جهاز ضم الفخد (Adductor)', increment: DB, cuesAr: ['اقفل رجليك ببطء', 'افتح بتحكم لحد إطالة مريحة', 'متسيبش الوزن يرزع'] },
  Plate_Pinch: { nameAr: 'مسك الطارات بالصوابع', metric: 'time', increment: 2.5, cuesAr: ['امسك طارتين ناعمين بالصوابع والإبهام', 'الدراع مفرود جنبك', 'قوة الصوابع والقبضة'] },
  Wrist_Roller: { nameAr: 'لفّاف الرسغ', increment: 2.5, cuesAr: ['الدراع مفرود قدامك', 'لف لحد ما الوزن يطلع وبعدين نزّله ببطء', 'العدّة = طلوع ونزول'] },
  Knee_Hip_Raise_On_Parallel_Bars: { nameAr: 'رفع ركب على الكرسي الروماني', increment: 0, cuesAr: ['ضهرك لازق في المسند', 'ارفع الركب للصدر وقوّس الحوض', 'متمرجحش'] },
  Jogging_Treadmill: { nameAr: 'جري خفيف على المشاية', metric: 'cardio', increment: 0, cuesAr: ['دقيقة جري ودقيقتين مشي وكرّر', 'زوّد وقت الجري تدريجيًا', 'وقف لو حسيت بوجع في الركبة'] },
  Barbell_Squat: { nameAr: 'سكوات بالبار', increment: DB, cuesAr: ['البار على أعلى الضهر', 'انزل والحوض لورا والصدر لفوق', 'ركبتك في اتجاه الصوابع'] },
  Goblet_Squat: { nameAr: 'جوبلت سكوات', increment: DBELL, cuesAr: ['امسك الدمبل قدام صدرك', 'انزل بين رجليك وضهرك مفرود', 'كويس للرجوع بعد انقطاع'] },
  Leg_Extensions: { nameAr: 'رفرفة أمامي', increment: DB, cuesAr: ['افرد للآخر واقف ثانية', 'نزول بطيء', 'ضهرك لازق في الكرسي'] },
  Seated_Leg_Curl: { nameAr: 'رفرفة خلفي قاعد', increment: DB, cuesAr: ['ثبّت فخدك تحت المسند', 'اقفل للآخر', 'نزول بطيء'] },
  Thigh_Abductor: { nameAr: 'جهاز فتح الفخد (Abductor)', increment: DB, cuesAr: ['افتح لبرة ببطء', 'اقفل بتحكم', 'ميل لقدام بسيط بيشغّل المؤخرة أكتر'] },
  Pullups: { nameAr: 'عقلة', increment: 0, cuesAr: ['ابدأ من دراع مفرود', 'اسحب لحد ما دقنك فوق البار', 'من غير مرجحة'] },
  'Chin-Up': { nameAr: 'عقلة قبضة عكسية', increment: 0, cuesAr: ['الكف ناحية وشك', 'اسحب صدرك للبار', 'نزول بطيء'] },
  'Barbell_Bench_Press_-_Medium_Grip': { nameAr: 'بنش بريس بالبار', increment: DB, cuesAr: ['لوحي الكتف مضمومين', 'البار ينزل لنص الصدر', 'رجلك ثابتة في الأرض'] },
  Pushups: { nameAr: 'ضغط', increment: 0, cuesAr: ['جسمك مستقيم', 'الكوع 45° من جسمك', 'صدرك يقرب من الأرض'] },
  Barbell_Shoulder_Press: { nameAr: 'ضغط كتف بالبار', increment: DB, cuesAr: ['شد البطن والمؤخرة', 'البار يطلع فوق راسك مستقيم', 'متقوّسش ضهرك'] },
  Dumbbell_Lunges: { nameAr: 'طعن بالدمبل', unilateral: true, increment: DBELL, cuesAr: ['خطوة لقدام وانزل بالركبتين 90°', 'الجسم مفرود', 'العدد لكل رجل'] },
  Hanging_Leg_Raise: { nameAr: 'رفع رجل وانت متعلق', increment: 0, cuesAr: ['متعلق في العقلة', 'ارفع رجلك لمستوى الحوض أو أعلى', 'من غير مرجحة'] },
  Pallof_Press: { nameAr: 'بالوف برس (ثبات البطن)', increment: DB, cuesAr: ['جنبك للكابل', 'ادفع الإيد لقدام وقاوم اللفة', 'العدد لكل ناحية'] },
  Cable_Rear_Delt_Fly: { nameAr: 'رفرفة خلفي كابل', increment: DB, cuesAr: ['الكابلات مقاطعة على مستوى الكتف', 'افتح لبرة بالكوع', 'وزن خفيف'] },
  Bodyweight_Squat: { nameAr: 'سكوات بوزن الجسم', increment: 0, cuesAr: ['رجليك بعرض الكتف', 'انزل والحوض لورا والصدر لفوق', 'ركبتك في اتجاه الصوابع'] },
  Inverted_Row: { nameAr: 'سحب مقلوب (تحت بار)', increment: 0, cuesAr: ['جسمك مستقيم تحت البار', 'اسحب صدرك للبار', 'كل ما رجلك تبعد يبقى أصعب'] },
  Bodyweight_Walking_Lunge: { nameAr: 'طعن بوزن الجسم', unilateral: true, increment: 0, cuesAr: ['خطوة لقدام والركبتين 90°', 'الجسم مفرود', 'العدد لكل رجل'] },
  Dumbbell_Squat: { nameAr: 'سكوات بالدمبل', increment: DBELL, cuesAr: ['دمبل في كل إيد جنبك', 'انزل والصدر لفوق', 'ادفع بالكعب'] },
  'Stiff-Legged_Dumbbell_Deadlift': { nameAr: 'رومانيان ديدلفت بالدمبل', increment: DBELL, cuesAr: ['ظهرك مفرود والدمبلز لازقين في رجلك', 'ادفع الحوض لورا', 'اطلع بشد المؤخرة'] },
  Dumbbell_Flyes: { nameAr: 'فتح صدر دمبل', increment: DBELL, cuesAr: ['كوعك مثني بسيط', 'افتح لحد ما تحس بإطالة في الصدر', 'قفّل كأنك بتحضن شجرة'] },
  Arnold_Dumbbell_Press: { nameAr: 'أرنولد برس', increment: DBELL, cuesAr: ['ابدأ والكف ناحيتك', 'لف الكف وانت بتطلع', 'متقوّسش ضهرك'] },
  Dumbbell_Shrug: { nameAr: 'ترابيس دمبل', increment: DBELL, cuesAr: ['ارفع كتفك لودانك', 'اثبت ثانية فوق', 'متلفّش كتفك'] },
  Barbell_Shrug: { nameAr: 'ترابيس بار', increment: DB, cuesAr: ['ارفع كتفك لفوق مستقيم', 'اثبت ثانية', 'نزول بطيء'] },
  'Close-Grip_Barbell_Bench_Press': { nameAr: 'بنش قبضة ضيقة (تراي)', increment: DB, cuesAr: ['الإيدين بعرض الكتف', 'الكوع قريب من جسمك', 'البار ينزل لأسفل الصدر'] },
  Bent_Over_Barbell_Row: { nameAr: 'سحب بار منحني', increment: DB, cuesAr: ['انحني 45° وضهرك مفرود', 'اسحب البار للبطن', 'متمرجحش بضهرك'] },
  Machine_Bench_Press: { nameAr: 'ضغط صدر جهاز', increment: DB, cuesAr: ['ضهرك لازق في الكرسي', 'ادفع لقدام من غير ما تقفل الكوع', 'رجوع بطيء'] },
  Cable_Crossover: { nameAr: 'كروس أوفر كابل', increment: DB, cuesAr: ['خطوة لقدام وميل بسيط', 'قفّل إيديك قدام صدرك', 'افتح بتحكم'] },
  'Incline_Push-Up': { nameAr: 'ضغط مايل (إيدك على بنش)', increment: 0, cuesAr: ['إيدك على بنش أو سطح عالي', 'جسمك مستقيم', 'أسهل من الضغط العادي'] },
  Bench_Dips: { nameAr: 'غطس على بنش (تراي)', increment: 0, cuesAr: ['إيدك على البنش ورا ضهرك', 'انزل لحد 90° في الكوع', 'لو الكتف وجعك قلل النزول'] },
  Tricep_Dumbbell_Kickback: { nameAr: 'تراي كيك باك دمبل', increment: 1, cuesAr: ['انحني والكوع لازق جنبك', 'افرد الدراع لورا للآخر', 'وزن خفيف'] },
  Concentration_Curls: { nameAr: 'باي تركيز', increment: 1, cuesAr: ['الكوع على فخدك', 'اطلع ببطء واعصر فوق', 'العدد لكل إيد'] },
  Dumbbell_Step_Ups: { nameAr: 'طلوع على بنش بالدمبل', unilateral: true, increment: DBELL, cuesAr: ['اطلع بالرجل اللي فوق مش بالزق', 'الركبة في اتجاه الصوابع', 'العدد لكل رجل'] },
  Crunches: { nameAr: 'كرانش', increment: 0, cuesAr: ['ارفع لوح كتفك بس', 'متشدّش راسك بإيدك', 'اطلع النفس وانت طالع'] },
  Elliptical_Trainer: { nameAr: 'أوربتراك', metric: 'cardio', increment: 0, cuesAr: ['شدة متوسطة (تقدر تتكلم)', 'ضهرك مفرود', 'بديل مريح للركبة عن الجري'] },
  Standing_Dumbbell_Triceps_Extension: { nameAr: 'تراي فوق الراس دمبل', increment: DBELL, cuesAr: ['امسك دمبل بالإيدين فوق راسك', 'نزّل ورا راسك والكوع ثابت', 'افرد للآخر'] },
  'Bent_Over_Two-Dumbbell_Row': { nameAr: 'سحب دمبلين منحني', increment: DBELL, cuesAr: ['انحني وضهرك مفرود', 'اسحب الكوعين لورا', 'اضغط لوحي الكتف'] },
  Leverage_Shoulder_Press: { nameAr: 'ضغط كتف جهاز', increment: DB, cuesAr: ['ضهرك لازق في المسند', 'ادفع لفوق من غير قفل الكوع', 'نزول بطيء'] },
  Seated_Calf_Raise: { nameAr: 'سمانة قاعد', increment: DB, cuesAr: ['اطلع على أطراف صوابعك', 'إطالة كاملة تحت', 'بيشغل العضلة السفلية للسمانة'] },
  Trap_Bar_Deadlift: { nameAr: 'ديدلفت بار سداسي', increment: DB, cuesAr: ['قف في نص البار وظهرك مفرود', 'ادفع الأرض برجلك', 'أريح على الضهر من الديدلفت العادي'] },
  Glute_Kickback: { nameAr: 'رفس للخلف (مؤخرة)', unilateral: true, increment: 0, cuesAr: ['على إيديك وركبك', 'ارفع رجلك لورا وشد المؤخرة', 'متقوّسش ضهرك'] },
  Leverage_Iso_Row: { nameAr: 'سحب جهاز (صدرك مسنود)', increment: DB, cuesAr: ['صدرك لازق في المسند', 'اسحب الكوع لورا', 'اضغط لوحي الكتف'] },
  Single_Leg_Glute_Bridge: { nameAr: 'جسر المؤخرة برجل واحدة', unilateral: true, increment: 0, cuesAr: ['نايم على ضهرك ورجل واحدة على الأرض', 'ادفع بالكعب وارفع الحوض', 'اعصر المؤخرة فوق ثانية'] },
  Superman: { nameAr: 'سوبرمان (ظهر سفلي)', metric: 'time', increment: 0, cuesAr: ['نايم على بطنك', 'ارفع إيديك ورجليك سوا بسيط', 'اثبت والرقبة مستقيمة'] },
  Standing_Dumbbell_Calf_Raise: { nameAr: 'سمانة واقف بالدمبل', increment: DBELL, cuesAr: ['صوابعك على درجة', 'اطلع للآخر وانزل لإطالة كاملة', 'وقفة ثانية فوق'] },
  'Close-Grip_Front_Lat_Pulldown': { nameAr: 'سحب عالي قبضة ضيقة', increment: DB, cuesAr: ['صدرك لفوق', 'اسحب البار لأعلى الصدر', 'طلوع بطيء لإطالة كاملة'] },
  External_Rotation_with_Cable: { nameAr: 'لف الكتف للخارج كابل', increment: 1, cuesAr: ['الكوع لازق في جنبك 90°', 'لف الساعد لبرة', 'وزن خفيف جدًا، لصحة الكتف'] },
}

/** Exercises not in free-exercise-db: text cues + optional user video. */
const CUSTOM: Exercise[] = [
  { id: 'chin_tucks', name: 'Chin Tucks', nameAr: 'سحب الدقن للخلف', muscles: ['neck'], equipment: 'body only', metric: 'reps', unilateral: false, images: [], instructions: [], custom: true, increment: 0, cuesAr: ['واقف وضهرك للحيطة', 'رجّع راسك لورا كأنك بتعمل دقن مزدوجة', 'اثبت ثانيتين، بيعالج الراس اللي لقدام'] },
  { id: 'wall_angels', name: 'Wall Angels', nameAr: 'ملائكة الحيطة', muscles: ['shoulders', 'middle back'], equipment: 'body only', metric: 'reps', unilateral: false, images: [], instructions: [], custom: true, increment: 0, cuesAr: ['ضهرك وراسك وإيديك لازقين في الحيطة', 'اطلع بإيديك لفوق ونزّل ببطء', 'لو الإيد بتبعد عن الحيطة قلل المدى'] },
  { id: 'dead_hang', name: 'Dead Hang', nameAr: 'التعلق في العقلة', muscles: ['forearms', 'lats'], equipment: 'body only', metric: 'time', unilateral: false, images: [], instructions: [], custom: true, increment: 0, cuesAr: ['اتعلق في العقلة بدراع مفرود', 'سيب ضهرك يتفرد وكتفك مشدود بسيط', 'قبضة + فرد للعمود الفقري'] },
  { id: 'gripper', name: 'Hand Gripper', nameAr: 'قبضة اليد (Gripper)', muscles: ['forearms'], equipment: 'other', metric: 'reps', unilateral: true, images: [], instructions: [], custom: true, increment: 0, cuesAr: ['اقفل للآخر واثبت ثانية', 'افتح ببطء', 'العدد لكل إيد'] },
  { id: 'finger_extensions', name: 'Band Finger Extensions', nameAr: 'فتح الصوابع بالأستك', muscles: ['forearms'], equipment: 'bands', metric: 'reps', unilateral: false, images: [], instructions: [], custom: true, increment: 0, cuesAr: ['حط أستك حوالين الصوابع الخمسة', 'افتح الصوابع للآخر ضد الأستك', 'بيوازن عضلات القبضة ويحمي الرسغ'] },
]

const rawList = raw as RawExercise[]

function fromRaw(r: RawExercise): Exercise {
  const m = META[r.id]
  if (!m) throw new Error(`Missing META for ${r.id}`)
  return {
    id: r.id,
    name: m.name ?? r.name,
    nameAr: m.nameAr,
    muscles: r.muscles,
    equipment: r.equipment,
    metric: m.metric ?? 'reps',
    unilateral: m.unilateral ?? false,
    images: r.images,
    cuesAr: m.cuesAr,
    instructions: r.instructions,
    custom: false,
    increment: m.increment ?? DB,
  }
}

function singleLegPress(): Exercise {
  const lp = rawList.find((r) => r.id === 'Leg_Press')
  if (!lp) throw new Error('Leg_Press missing from catalog')
  return {
    ...fromRaw(lp),
    id: 'single_leg_press',
    name: 'Single-Leg Leg Press',
    nameAr: 'ليج برس رجل واحدة',
    unilateral: true,
    cuesAr: ['ابدأ بالرجل الأضعف', 'رجل واحدة في نص البلاتة، والتانية على الأرض', 'وزن أقل من نص وزن الرجلين مع بعض'],
  }
}

export const CATALOG: Exercise[] = [...rawList.map(fromRaw), singleLegPress(), ...CUSTOM]

export const MUSCLE_AR: Record<string, string> = {
  abdominals: 'بطن', abductors: 'فتح الفخد', adductors: 'ضم الفخد', biceps: 'باي',
  calves: 'سمانة', chest: 'صدر', forearms: 'ساعد', glutes: 'مؤخرة', hamstrings: 'خلفية',
  lats: 'ظهر عريض', 'lower back': 'ظهر سفلي', 'middle back': 'ظهر أوسط', neck: 'رقبة',
  quadriceps: 'أمامية', shoulders: 'كتف', traps: 'ترابيس', triceps: 'تراي',
}
