"""Meaningful economy and server-time regressions; no live learner data."""
import json
import sys
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/'backend'))
from farm import initial, apply_action, migrate_paddy
CONFIG = json.loads((ROOT/'backend/seed_data/farm_catalog.json').read_text(encoding='utf-8'))
NOW = 1790990000000


class FarmRules(unittest.TestCase):
    def run_action(self,state,kind,target='cloud',now=NOW,**extra):
        return apply_action(state,dict(type=kind,target=target,**extra),CONFIG,now)[0]

    def test_first_wool_and_repeat_prevention(self):
        state=initial(NOW); next_state=self.run_action(state,'shear')
        self.assertEqual(next_state['inventory']['wool'],1)
        self.assertEqual(state['inventory']['wool'],0)
        with self.assertRaises(ValueError): self.run_action(next_state,'shear')
        later=self.run_action(next_state,'shear',now=NOW+30*24*3600000)
        self.assertEqual(later['inventory']['wool'],2) # not 120 offline batches

    def test_growth_once_daily_without_streak(self):
        state=initial(NOW);state['sheep'][0]['careCount']=0
        state=self.run_action(state,'pet');state=self.run_action(state,'feed');state=self.run_action(state,'walk')
        self.assertEqual(state['sheep'][0]['careCount'],1)
        with self.assertRaises(ValueError):self.run_action(state,'shear')
        state=self.run_action(state,'pet',now=NOW+5*86400000)
        self.assertEqual(state['sheep'][0]['careCount'],2)

    def test_plant_water_harvest_and_duplicates(self):
        state=self.run_action(initial(NOW),'plant','plot-1',crop='clover')
        with self.assertRaises(ValueError):self.run_action(state,'plant','plot-1',crop='carrot')
        with self.assertRaises(ValueError):self.run_action(state,'harvest','plot-1')
        state=self.run_action(state,'water','plot-1')
        self.assertEqual(state['plots'][0]['readyAt'],NOW+60000)
        with self.assertRaises(ValueError):self.run_action(state,'water','plot-1')
        with self.assertRaises(ValueError):self.run_action(state,'harvest','plot-1',now=NOW+59999)
        state=self.run_action(state,'harvest','plot-1',now=NOW+60000)
        self.assertEqual(state['inventory']['clover'],1)
        with self.assertRaises(ValueError):self.run_action(state,'harvest','plot-1',now=NOW+60000)
        state=self.run_action(state,'plant','plot-1',crop='clover',now=NOW+60000)
        state=self.run_action(state,'water','plot-1',now=NOW+60000)
        self.assertEqual(state['plots'][0]['readyAt'],NOW+60000+1800000)

    def test_craft_no_overspend_or_second_reward(self):
        state=initial(NOW)
        with self.assertRaises(ValueError):self.run_action(state,'craft','rug')
        state['inventory']['wool']=2
        state=self.run_action(state,'craft','rug')
        self.assertEqual(state['inventory']['wool'],0)
        self.assertIn('rug',state['decorations'])
        with self.assertRaises(ValueError):self.run_action(state,'craft','rug')

    def test_foreign_targets_and_untrusted_items(self):
        for kind,target,extra in [('shear','someone-else',{}),('water','plot-99',{}),('plant','plot-1',{'crop':'money'}),('craft','coins',{})]:
            with self.assertRaises(ValueError):self.run_action(initial(NOW),kind,target,**extra)

    def test_paddy_requires_planting_and_watering(self):
        state=initial(NOW)
        for kind in ['paddy-water','paddy-harvest']:
            with self.assertRaises(ValueError):self.run_action(state,kind,'paddy')
        state=self.run_action(state,'paddy-plant','paddy')
        self.assertEqual(state['paddy']['readyAt'],NOW+30*86400000)
        with self.assertRaises(ValueError):self.run_action(state,'paddy-plant','paddy')
        with self.assertRaises(ValueError):self.run_action(state,'paddy-harvest','paddy')
        state=self.run_action(state,'paddy-water','paddy')
        self.assertEqual(state['paddy']['readyAt'],NOW+30*86400000-6*3600000)
        with self.assertRaises(ValueError):self.run_action(state,'paddy-water','paddy')

    def test_paddy_deadline_and_bounded_reward(self):
        state=self.run_action(initial(NOW),'paddy-plant','paddy')
        state=self.run_action(state,'paddy-water','paddy')
        ready=state['paddy']['readyAt']
        with self.assertRaises(ValueError):apply_action(state,{'type':'paddy-harvest','target':'paddy'},CONFIG,ready-1)
        state,_=apply_action(state,{'type':'paddy-harvest','target':'paddy','rewardPoints':9999},CONFIG,ready)
        self.assertEqual(state['paddy']['totalReward'],12)
        self.assertEqual(state['paddy']['harvests'],1)
        self.assertIsNone(state['paddy']['plantedAt'])
        with self.assertRaises(ValueError):apply_action(state,{'type':'paddy-harvest','target':'paddy'},CONFIG,ready+365*86400000)
        state,_=apply_action(state,{'type':'paddy-plant','target':'paddy'},CONFIG,ready)
        state,_=apply_action(state,{'type':'paddy-water','target':'paddy'},CONFIG,ready)
        self.assertEqual(state['paddy']['cycle'],2)
        self.assertEqual(state['paddy']['readyAt'],ready+30*86400000-6*3600000)

    def test_paddy_water_once_per_beijing_day_and_clock_boundaries(self):
        before_midnight=1791043199000 # 2026-10-03 23:59:59 Beijing
        state=self.run_action(initial(before_midnight),'paddy-plant','paddy',now=before_midnight)
        state=self.run_action(state,'paddy-water','paddy',now=before_midnight)
        with self.assertRaises(ValueError):self.run_action(state,'paddy-water','paddy',now=before_midnight+500)
        ready=state['paddy']['readyAt']
        state=self.run_action(state,'paddy-water','paddy',now=before_midnight+1000)
        self.assertEqual(state['paddy']['readyAt'],ready-6*3600000)
        self.assertEqual(state['paddy']['waterCount'],2)
        self.assertEqual(state['paddy']['boostMs'],12*3600000)
        with self.assertRaises(ValueError):self.run_action(state,'paddy-water','paddy',now=before_midnight+2000)

    def test_paddy_no_water_still_matures_and_water_near_deadline(self):
        state=self.run_action(initial(NOW),'paddy-plant','paddy')
        ready=state['paddy']['readyAt']
        harvested=self.run_action(state,'paddy-harvest','paddy',now=ready)
        self.assertEqual(harvested['paddy']['totalReward'],12)
        near=self.run_action(state,'paddy-water','paddy',now=ready-3600000)
        self.assertEqual(near['paddy']['readyAt'],ready-3600000)
        with self.assertRaises(ValueError):self.run_action(near,'paddy-water','paddy',now=ready)
        harvested=self.run_action(near,'paddy-harvest','paddy',now=ready-3600000)
        replanted=self.run_action(harvested,'paddy-plant','paddy',now=ready-3600000)
        with self.assertRaises(ValueError):self.run_action(replanted,'paddy-water','paddy',now=ready-3600000)

    def test_paddy_legacy_state_preserves_progress_and_today_limit(self):
        state=initial(NOW)
        state['paddy']={'plantedAt':NOW-1000,'wateredAt':NOW,'readyAt':NOW+30*86400000,'cycle':1,'harvests':0,'totalReward':0,'rewardPoints':12}
        self.assertTrue(migrate_paddy(state,CONFIG))
        self.assertEqual(state['paddy']['readyAt'],NOW+30*86400000)
        self.assertFalse(migrate_paddy(state,CONFIG))
        with self.assertRaises(ValueError):self.run_action(state,'paddy-water','paddy')

    def test_paddy_offline_and_ownership(self):
        state=self.run_action(initial(NOW),'paddy-plant','paddy')
        state=self.run_action(state,'paddy-water','paddy')
        state,_=apply_action(state,{'type':'paddy-harvest','target':'paddy'},CONFIG,NOW+365*86400000)
        self.assertEqual(state['paddy']['totalReward'],12)
        with self.assertRaises(ValueError):self.run_action(state,'paddy-plant','someone-else')

    def test_rename_and_zero_cost_care(self):
        state=initial(NOW)
        for _ in range(20):state=self.run_action(state,'feed')
        self.assertEqual(state['inventory'],{'wool':0,'clover':0,'carrot':0})
        self.assertEqual(self.run_action(state,'rename',name='软软')['sheep'][0]['name'],'软软')
        with self.assertRaises(ValueError):self.run_action(state,'rename',name='')


if __name__=='__main__':unittest.main()
