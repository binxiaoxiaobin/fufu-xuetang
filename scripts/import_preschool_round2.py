"""Use the append-only importer for preschool scopes."""
import sys
import import_subject_round2 as importer
from build_preschool_round2 import DATASET,OUTPUT,GRADES,validate

if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8')
    importer.DATASET=DATASET
    importer.OUTPUT=OUTPUT
    importer.GRADES=GRADES
    importer.validate=validate
    importer.STAGE='幼儿园'
    importer.main()
